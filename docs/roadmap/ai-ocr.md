# AI/OCR Roadmap

Awesome ZA Toolbox is parser-only today. It does not call AI models, upload documents, or send statement contents to external services.

This roadmap describes a future opt-in AI/OCR layer for documents that cannot be handled reliably through ordinary PDF text extraction.

## Why AI/OCR might help

Future AI/OCR support could help with:

- scanned PDFs with no embedded text
- PDFs where extracted text has broken reading order
- tables that span pages
- municipal statements with irregular layout
- parser fallback when deterministic extraction is incomplete
- converting document layout into structured Markdown for parser-specific cleanup

Rule-based parsers should remain the default for known, well-formed statement layouts. AI/OCR should be an explicit fallback or inspection tool, not an invisible replacement.

## Provider model

The future interface should be provider-neutral:

```ts
interface OcrProvider {
  name: string;
  mode: "local" | "local-server" | "remote";
  extract(input: {
    filePath: string;
  }): Promise<{
    text: string;
    metadata: Record<string, unknown>;
  }>;
}
```

Provider modes:

- `local`: runs a model or OCR engine directly on the user's machine.
- `local-server`: talks to a user-started local service, for example Docker, vLLM, llama.cpp, or another local runtime.
- `remote`: sends document data to an external API only after explicit user opt-in.

## Example model

The first named example is Baidu's `baidu/Unlimited-OCR` model on Hugging Face:

- Model: <https://huggingface.co/baidu/Unlimited-OCR>
- Space: <https://huggingface.co/spaces/baidu/Unlimited-OCR>

The project should not hard-code this model as the only path. OCR and document-parsing models are moving quickly, so the architecture should allow other providers such as PaddleOCR-VL-style document parsers or conventional OCR engines.

## Future CLI shape

Possible inspection command:

```bash
za-toolbox dev ocr ./statement.pdf --provider local-unlimited-ocr --output extracted.md
```

Possible parser fallback:

```bash
za-toolbox bank fnb parse ./statement.pdf --ocr-provider local-unlimited-ocr --format json
```

Remote providers must require an explicit provider name and credentials. There should be no default remote provider and no automatic upload path.

## Privacy requirements

Any future AI/OCR provider must document:

- whether document data leaves the machine
- what runtime or external service is used
- what credentials or tokens are required
- whether intermediate files are written
- how temporary files are cleaned up
- whether the provider can run fully offline

The CLI should display enough provider information for users to understand the privacy boundary before using it.

## Non-goals for the current MVP

This roadmap does not add:

- model downloads
- Python runtime setup
- Docker setup
- Hugging Face API integration
- remote inference
- OCR-backed parsing behavior
- new runtime dependencies

Current releases remain deterministic parser tooling unless a future version explicitly adds an opt-in provider.
