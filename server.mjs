import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { importJobsFromUrls } from "./lib/job-discovery.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const maxUploadBytes = 12 * 1024 * 1024;
const maxJsonBytes = 256 * 1024;
const extractPdfTextScript = path.join(__dirname, "scripts", "extract-pdf-text.swift");
const execFileAsync = promisify(execFile);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);

  if (request.method === "POST" && url.pathname === "/api/extract-pdf-text") {
    await handlePdfExtraction(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/import-jobs") {
    await handleJobImport(request, response);
    return;
  }

  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path
    .normalize(decodeURIComponent(requestPath))
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const fileStats = await stat(filePath);
  if (fileStats.isDirectory()) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(response);
});

async function handlePdfExtraction(request, response) {
  if (process.platform !== "darwin") {
    writeJson(response, 501, {
      error: "PDF extraction currently requires macOS because it uses PDFKit locally."
    });
    return;
  }

  const contentType = String(request.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/pdf")) {
    writeJson(response, 415, {
      error: "Upload a PDF file for extraction."
    });
    return;
  }

  let tempDir = "";

  try {
    const body = await readRequestBody(request, maxUploadBytes);
    if (body.length === 0) {
      writeJson(response, 400, { error: "The uploaded PDF was empty." });
      return;
    }

    tempDir = await mkdtemp(path.join(tmpdir(), "job-optimizer-pdf-"));
    const tempFile = path.join(tempDir, `${randomUUID()}.pdf`);
    await writeFile(tempFile, body);

    const extractedText = await extractPdfText(tempFile);
    if (!extractedText.trim()) {
      writeJson(response, 422, {
        error: "I could not extract readable text from that PDF. If it is image-only, paste the text manually for now."
      });
      return;
    }

    writeJson(response, 200, {
      text: extractedText
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF extraction failed.";
    const statusCode = message === "File too large." ? 413 : 500;
    writeJson(response, statusCode, { error: message });
  } finally {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
    }
  }
}

async function handleJobImport(request, response) {
  const contentType = String(request.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    writeJson(response, 415, {
      error: "Send JSON with a urls array."
    });
    return;
  }

  try {
    const body = await readRequestBody(request, maxJsonBytes);
    const payload = JSON.parse(body.toString("utf8"));
    const urls = Array.isArray(payload.urls) ? payload.urls : [];

    if (urls.length === 0) {
      writeJson(response, 400, {
        error: "Add at least one Greenhouse, Lever, Ashby, or direct job URL."
      });
      return;
    }

    const result = await importJobsFromUrls(urls);
    writeJson(response, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job import failed.";
    const statusCode = message === "File too large." ? 413 : 500;
    writeJson(response, statusCode, {
      error: message
    });
  }
}

async function extractPdfText(filePath) {
  const { stdout } = await execFileAsync("swift", [extractPdfTextScript, filePath], {
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: path.join(tmpdir(), "clang-module-cache"),
      SWIFT_MODULE_CACHE_PATH: path.join(tmpdir(), "swift-module-cache")
    },
    maxBuffer: 8 * 1024 * 1024
  });

  return stdout;
}

function readRequestBody(request, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let finished = false;

    request.on("data", (chunk) => {
      if (finished) {
        return;
      }

      totalBytes += chunk.length;
      if (totalBytes > limitBytes) {
        finished = true;
        reject(new Error("File too large."));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      if (!finished) {
        finished = true;
        resolve(Buffer.concat(chunks));
      }
    });

    request.on("error", (error) => {
      if (!finished) {
        finished = true;
        reject(error);
      }
    });
  });
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

server.listen(port, host, () => {
  console.log(`Job Optimizer running at http://${host}:${port}`);
});
