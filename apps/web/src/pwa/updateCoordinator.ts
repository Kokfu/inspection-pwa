import { Workbox } from "workbox-window";

export const UPDATE_CHECK_INTERVAL_MS = 45 * 60 * 1000;
export const UPDATE_ACTIVATION_TIMEOUT_MS = 60 * 1000;

export type PwaUpdateState = {
  updateAvailable: boolean;
  offlineReady: boolean;
  activationRequestedByThisClient: boolean;
  controllerChanged: boolean;
  reloadPending: boolean;
  updating: boolean;
};

export type PwaWorker = {
  register: (options?: { immediate?: boolean }) => Promise<ServiceWorkerRegistration | undefined>;
  messageSkipWaiting: () => void | Promise<void>;
  addEventListener: (type: "installed" | "waiting", listener: (event: { isUpdate?: boolean }) => void) => void;
  removeEventListener: (type: "installed" | "waiting", listener: (event: { isUpdate?: boolean }) => void) => void;
};

export type CreatePwaWorker = () => PwaWorker;

type ServiceWorkerContainerLike = Pick<
  ServiceWorkerContainer,
  "addEventListener" | "removeEventListener" | "controller" | "getRegistration"
>;

export type PwaUpdateCoordinatorOptions = {
  isSafeToReload?: () => boolean;
  reloadPage?: () => void;
  serviceWorkerContainer?: ServiceWorkerContainerLike;
  activationTimeoutMs?: number;
};

const initialState: PwaUpdateState = {
  updateAvailable: false,
  offlineReady: false,
  activationRequestedByThisClient: false,
  controllerChanged: false,
  reloadPending: false,
  updating: false
};

const createProductionPwaWorker: CreatePwaWorker = () => (
  new Workbox("/sw.js", { scope: "/", type: "classic" }) as unknown as PwaWorker
);

export class PwaUpdateCoordinator {
  private state = initialState;
  private worker?: PwaWorker;
  private registration?: ServiceWorkerRegistration;
  private cleanupUpdateChecks?: () => void;
  private cleanupRegistrationObserver?: () => void;
  private cleanupWorkerListeners?: () => void;
  private listeners = new Set<(state: PwaUpdateState) => void>();
  private started = false;
  private initialControllerObserved = false;
  private reloadStarted = false;
  private updateCheckInFlight = false;
  private activationWatchdog?: ReturnType<typeof setTimeout>;
  private readonly isSafeToReload: () => boolean;
  private readonly reloadPage: () => void;
  private readonly serviceWorkers?: ServiceWorkerContainerLike;
  private readonly activationTimeoutMs: number;

  constructor(
    private readonly createWorker: CreatePwaWorker = createProductionPwaWorker,
    options: PwaUpdateCoordinatorOptions = {}
  ) {
    this.isSafeToReload = options.isSafeToReload ?? (() => false);
    this.reloadPage = options.reloadPage ?? (() => window.location.reload());
    this.serviceWorkers = options.serviceWorkerContainer ?? (
      typeof navigator === "undefined" ? undefined : navigator.serviceWorker
    );
    this.activationTimeoutMs = options.activationTimeoutMs ?? UPDATE_ACTIVATION_TIMEOUT_MS;
  }

  snapshot() {
    return this.state;
  }

  subscribe(listener: (state: PwaUpdateState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  start() {
    if (this.started || !this.serviceWorkers) return;
    this.started = true;
    this.initialControllerObserved = Boolean(this.serviceWorkers.controller);
    this.serviceWorkers.addEventListener("controllerchange", this.onControllerChange);

    this.worker = this.createWorker();
    const onWaiting = (event: { isUpdate?: boolean }) => {
      if (event.isUpdate && this.serviceWorkers?.controller) {
        this.setState({ updateAvailable: true });
      } else if (this.registration) {
        this.reconcileRegistration(this.registration);
      }
    };
    const onInstalled = (event: { isUpdate?: boolean }) => {
      if (!event.isUpdate) this.setState({ offlineReady: true });
    };
    this.worker.addEventListener("waiting", onWaiting);
    this.worker.addEventListener("installed", onInstalled);
    this.cleanupWorkerListeners = () => {
      this.worker?.removeEventListener("waiting", onWaiting);
      this.worker?.removeEventListener("installed", onInstalled);
    };

    // The PWA plugin generates /sw.js. Register it through Workbox's public
    // client API because vite-plugin-pwa's virtual prompt helper always adds
    // a global controlling-to-reload listener for a waiting worker.
    void this.registerAndReconcile();
  }

  stop() {
    this.cleanupUpdateChecks?.();
    this.cleanupUpdateChecks = undefined;
    this.cleanupRegistrationObserver?.();
    this.cleanupRegistrationObserver = undefined;
    this.cleanupWorkerListeners?.();
    this.cleanupWorkerListeners = undefined;
    this.serviceWorkers?.removeEventListener("controllerchange", this.onControllerChange);
    this.clearActivationWatchdog();
    this.worker = undefined;
    this.registration = undefined;
    this.updateCheckInFlight = false;
    this.started = false;
  }

  requestUpdate() {
    if (this.state.reloadPending) return this.reloadWhenSafe();
    if (!this.state.updateAvailable || this.state.updating || !this.worker) return false;

    this.setState({ activationRequestedByThisClient: true, updating: true });
    this.startActivationWatchdog();
    try {
      void Promise.resolve(this.worker.messageSkipWaiting()).catch(() => this.finishActivationAttempt());
    } catch {
      this.finishActivationAttempt();
    }
    return true;
  }

  private reloadWhenSafe() {
    if (!this.state.reloadPending || !this.isSafeToReload() || this.reloadStarted) return false;
    this.reloadStarted = true;
    this.reloadPage();
    return true;
  }

  private onControllerChange = () => {
    if (!this.started) return;
    if (!this.initialControllerObserved) {
      this.initialControllerObserved = true;
      return;
    }

    this.clearActivationWatchdog();
    const reloadNow = this.state.activationRequestedByThisClient
      && this.isSafeToReload()
      && !this.reloadStarted;
    this.setState({
      updateAvailable: true,
      controllerChanged: true,
      reloadPending: !reloadNow,
      updating: false
    });
    if (reloadNow) this.reloadWhenSafeAfterActivation();
  };

  private reloadWhenSafeAfterActivation() {
    if (this.reloadStarted) return;
    this.reloadStarted = true;
    this.reloadPage();
  }

  private observeRegistration(registration: ServiceWorkerRegistration) {
    this.cleanupRegistrationObserver?.();
    const showWaitingUpdate = () => this.reconcileRegistration(registration);
    const onUpdateFound = () => {
      const installing = registration.installing;
      if (!installing) {
        showWaitingUpdate();
        return;
      }
      const onStateChange = () => {
        if (installing.state !== "installed") return;
        installing.removeEventListener("statechange", onStateChange);
        showWaitingUpdate();
      };
      installing.addEventListener("statechange", onStateChange);
    };
    registration.addEventListener("updatefound", onUpdateFound);
    showWaitingUpdate();
    this.cleanupRegistrationObserver = () => {
      registration.removeEventListener("updatefound", onUpdateFound);
    };
  }

  private startUpdateChecks() {
    if (!this.registration || this.cleanupUpdateChecks || typeof window === "undefined") return;
    const checkForUpdate = () => {
      if (!this.registration || this.updateCheckInFlight) return;
      this.updateCheckInFlight = true;
      void this.registration.update().catch(() => undefined).finally(() => {
        this.updateCheckInFlight = false;
      });
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };

    document.addEventListener("visibilitychange", checkWhenVisible);
    const interval = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    if (!this.state.updateAvailable) checkForUpdate();
    this.cleanupUpdateChecks = () => {
      document.removeEventListener("visibilitychange", checkWhenVisible);
      window.clearInterval(interval);
    };
  }

  private startActivationWatchdog() {
    this.clearActivationWatchdog();
    this.activationWatchdog = setTimeout(() => this.finishActivationAttempt(), this.activationTimeoutMs);
  }

  private finishActivationAttempt() {
    this.clearActivationWatchdog();
    if (!this.state.controllerChanged) this.setState({ updating: false });
  }

  private clearActivationWatchdog() {
    if (this.activationWatchdog === undefined) return;
    clearTimeout(this.activationWatchdog);
    this.activationWatchdog = undefined;
  }

  private async registerAndReconcile() {
    try {
      const registration = await this.worker?.register({ immediate: true })
        ?? await this.serviceWorkers?.getRegistration("/sw.js");
      if (!registration || !this.started) return;
      this.registration = registration;
      this.observeRegistration(registration);
      this.startUpdateChecks();
    } catch {
      // Registration failures must not interrupt field work.
    }
  }

  private reconcileRegistration(registration: ServiceWorkerRegistration) {
    const hasPriorControlledWorker = Boolean(
      this.serviceWorkers?.controller && registration.active
    );
    if (registration.waiting && hasPriorControlledWorker) {
      this.setState({ updateAvailable: true });
    }
  }

  private setState(change: Partial<PwaUpdateState>) {
    const nextState = { ...this.state, ...change };
    if (Object.keys(change).every((key) => nextState[key as keyof PwaUpdateState] === this.state[key as keyof PwaUpdateState])) {
      return;
    }
    this.state = nextState;
    this.listeners.forEach((listener) => listener(this.state));
  }
}
