import { useState } from "react";
import { createRoot } from "react-dom/client";
import { RemarksField } from "../src/inspectionControls/RemarksField";
import "../src/styles/app.css";

function Harness() {
  const [remarks, setRemarks] = useState("");
  return <main><RemarksField systemKey="automatic_sprinkler" label="Remarks" definition={{ policy: "optional", maxLength: 2000 }} value={remarks} readOnly={false} onChange={setRemarks} /></main>;
}
createRoot(document.getElementById("view")!).render(<Harness />);
