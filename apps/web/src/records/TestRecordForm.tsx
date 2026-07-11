import { useState } from "react";
import type { TestRecordFormValues } from "./testRecordTypes";

type TestRecordFormProps = {
  onSaveDraft: (values: TestRecordFormValues) => Promise<void>;
  onSubmitLocal: (values: TestRecordFormValues) => Promise<void>;
};

function defaultCreatedAt() {
  const now = new Date();
  now.setSeconds(0, 0);
  return now.toISOString().slice(0, 16);
}

function toIsoLocal(value: string) {
  return new Date(value).toISOString();
}

export function TestRecordForm({
  onSaveDraft,
  onSubmitLocal
}: TestRecordFormProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [createdAt, setCreatedAt] = useState(defaultCreatedAt);
  const [message, setMessage] = useState("");

  function values(): TestRecordFormValues {
    return {
      title,
      notes,
      createdAt: toIsoLocal(createdAt)
    };
  }

  function reset() {
    setTitle("");
    setNotes("");
    setCreatedAt(defaultCreatedAt());
  }

  function isValid() {
    if (title.trim().length === 0) {
      setMessage("Title is required");
      return false;
    }

    if (Number.isNaN(Date.parse(createdAt))) {
      setMessage("Created At is required");
      return false;
    }

    return true;
  }

  async function handleSaveDraft() {
    if (!isValid()) return;
    await onSaveDraft(values());
    setMessage("Draft saved on this device");
    reset();
  }

  async function handleSubmitLocal() {
    if (!isValid()) return;
    await onSubmitLocal(values());
    setMessage("Record saved locally and queued for sync");
    reset();
  }

  return (
    <form className="record-form">
      <label>
        <span>Title</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={200}
        />
      </label>
      <label>
        <span>Notes</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={5}
          maxLength={4000}
        />
      </label>
      <label>
        <span>Created At</span>
        <input
          type="datetime-local"
          value={createdAt}
          onChange={(event) => setCreatedAt(event.target.value)}
          required
        />
      </label>
      <div className="form-actions">
        <button type="button" onClick={handleSaveDraft}>
          Save Draft
        </button>
        <button type="button" onClick={handleSubmitLocal}>
          Submit Local
        </button>
      </div>
      {message ? <p className="form-message">{message}</p> : null}
    </form>
  );
}
