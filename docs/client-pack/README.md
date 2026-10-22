# Printable editions

| File | For | Source |
|---|---|---|
| `MFE-Inspection-Client-Handover-Pack.pdf` / `.docx` | Everyone at the client (plain language, no technical terms) | [`docs/handover/`](../handover/README.md) |
| `MFE-Inspection-Office-PC-Technical-Guide.pdf` / `.docx` | Whoever supports the office computer | [`docs/it-guide/`](../it-guide/README.md) |

Generated 2026-10-22. Edit the Markdown, never the Word files, then rebuild. The PDFs and Word files ship to the
client; this README and `build/` stay in the developer repository (`.gitattributes`).

## Rebuild

Needs Node.js and Microsoft Word on Windows. The npm packages go into a temporary folder, not the project:

```powershell
$tmp = New-Item -ItemType Directory -Force "$env:TEMP\handover-pack"
Copy-Item docs\client-pack\build\* $tmp
cd $tmp; npm init -y | Out-Null; npm install docx@9 marked@14
$out = "C:\PWA_OfflineRecordWebApp\docs\client-pack"
node build-pack.mjs C:\PWA_OfflineRecordWebApp handover "$out\MFE-Inspection-Client-Handover-Pack.docx"
node build-pack.mjs C:\PWA_OfflineRecordWebApp it-guide "$out\MFE-Inspection-Office-PC-Technical-Guide.docx"
foreach ($n in "Client-Handover-Pack", "Office-PC-Technical-Guide") {
  powershell -ExecutionPolicy Bypass -File word-export.ps1 -Docx "$out\MFE-Inspection-$n.docx" -Pdf "$out\MFE-Inspection-$n.pdf"
}
```

`build-pack.mjs` turns every numbered chapter (`NN-*.md`) of the folder into one document with a cover and a
contents page; on paper, links become "chapter N". It stops if a `[FILL IN` or `[CONFIRM` placeholder is left.
`word-export.ps1` opens the file in Word, fills in the contents page and page numbers, saves it, and exports the
PDF with bookmarks.
