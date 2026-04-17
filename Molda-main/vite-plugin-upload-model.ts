/**
 * Vite plugin: upload de modelos 3D para public/models/
 * 
 * Cria a rota POST /api/upload-model no dev server.
 * Recebe multipart/form-data com MÚLTIPLOS arquivos
 * (.gltf + .bin + texturas) e salva em public/models/<slug>/.
 */
import type { Plugin } from "vite";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import path from "path";

// GLTF pode ter .gltf + .bin + texturas (jpg/png)
const ALLOWED_EXTENSIONS = [".glb", ".gltf", ".bin", ".png", ".jpg", ".jpeg", ".webp"];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB (múltiplos arquivos)

function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
}

export default function uploadModelPlugin(): Plugin {
    return {
        name: "vite-plugin-upload-model",
        configureServer(server) {
            server.middlewares.use("/api/upload-model", async (req, res) => {
                if (req.method !== "POST") {
                    res.statusCode = 405;
                    res.end(JSON.stringify({ error: "Method not allowed" }));
                    return;
                }

                try {
                    const contentType = req.headers["content-type"] || "";

                    // Parse multipart boundary
                    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
                    if (!boundaryMatch) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: "Missing multipart boundary" }));
                        return;
                    }
                    const boundary = boundaryMatch[1] || boundaryMatch[2];

                    // Read entire body
                    const chunks: Buffer[] = [];
                    let totalSize = 0;

                    await new Promise<void>((resolve, reject) => {
                        req.on("data", (chunk: Buffer) => {
                            totalSize += chunk.length;
                            if (totalSize > MAX_FILE_SIZE) {
                                reject(new Error(`File too large. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB`));
                                return;
                            }
                            chunks.push(chunk);
                        });
                        req.on("end", resolve);
                        req.on("error", reject);
                    });

                    const body = Buffer.concat(chunks);

                    // Parse all parts from multipart
                    const parts = parseMultipart(body, boundary);

                    const fileParts = parts.filter(p => p.filename);
                    const slugPart = parts.find(p => p.name === "slug");

                    if (fileParts.length === 0) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: "No files provided" }));
                        return;
                    }

                    // Find the primary model file (.gltf or .glb)
                    const primaryFile = fileParts.find(p => {
                        const e = path.extname(p.filename || "").toLowerCase();
                        return e === ".gltf" || e === ".glb";
                    });

                    if (!primaryFile || !primaryFile.filename) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: "No .gltf or .glb file found in upload." }));
                        return;
                    }

                    // Determine folder name
                    const primaryExt = path.extname(primaryFile.filename).toLowerCase();
                    const folderName = slugPart
                        ? slugify(slugPart.data.toString("utf8").trim())
                        : slugify(path.basename(primaryFile.filename, primaryExt));

                    if (!folderName) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: "Could not generate folder name" }));
                        return;
                    }

                    // Create target directory
                    const publicModelsDir = path.resolve(process.cwd(), "public", "models", folderName);
                    if (!existsSync(publicModelsDir)) {
                        mkdirSync(publicModelsDir, { recursive: true });
                    }

                    // Save ALL uploaded files (.gltf + .bin + textures)
                    const savedFiles: string[] = [];
                    for (const fp of fileParts) {
                        if (!fp.filename) continue;
                        const ext = path.extname(fp.filename).toLowerCase();
                        if (!ALLOWED_EXTENSIONS.includes(ext)) {
                            console.warn(`[upload-model] Skipping unsupported file: ${fp.filename}`);
                            continue;
                        }
                        const targetPath = path.join(publicModelsDir, fp.filename);
                        const ws = createWriteStream(targetPath);
                        ws.write(fp.data);
                        ws.end();
                        await new Promise<void>((resolve, reject) => {
                            ws.on("finish", resolve);
                            ws.on("error", reject);
                        });
                        savedFiles.push(fp.filename);
                        console.log(`[upload-model] Saved: ${targetPath}`);
                    }

                    // Return the path to primary model file
                    const modelPath = `/models/${folderName}/${primaryFile.filename}`;

                    console.log(`[upload-model] Model path: ${modelPath}`);
                    console.log(`[upload-model] All files: ${savedFiles.join(", ")}`);

                    res.statusCode = 200;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({
                        success: true,
                        path: modelPath,
                        folder: folderName,
                        filename: primaryFile.filename,
                        files: savedFiles,
                    }));
                } catch (err: any) {
                    console.error("[upload-model] Error:", err);
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: err?.message || "Upload failed" }));
                }
            });
        },
    };
}

// ── Simple multipart parser ──────────────────────────────────────────────────

type MultipartPart = {
    name?: string;
    filename?: string;
    contentType?: string;
    data: Buffer;
};

function parseMultipart(body: Buffer, boundary: string): MultipartPart[] {
    const parts: MultipartPart[] = [];
    const delimiter = Buffer.from(`--${boundary}`);
    const endDelimiter = Buffer.from(`--${boundary}--`);
    const CRLF = Buffer.from("\r\n");
    const DOUBLE_CRLF = Buffer.from("\r\n\r\n");

    let pos = 0;

    // Find first delimiter
    const firstIdx = indexOf(body, delimiter, pos);
    if (firstIdx === -1) return parts;
    pos = firstIdx + delimiter.length;

    // Skip CRLF after first delimiter
    if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;

    while (pos < body.length) {
        // Check for end delimiter
        const nextDelimiterIdx = indexOf(body, delimiter, pos);
        if (nextDelimiterIdx === -1) break;

        // Extract this part's content (headers + body)
        const partContent = body.subarray(pos, nextDelimiterIdx - 2); // -2 for trailing CRLF before delimiter

        // Split headers from body
        const headerEndIdx = indexOf(partContent, DOUBLE_CRLF, 0);
        if (headerEndIdx === -1) {
            pos = nextDelimiterIdx + delimiter.length;
            if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;
            continue;
        }

        const headersStr = partContent.subarray(0, headerEndIdx).toString("utf8");
        const data = partContent.subarray(headerEndIdx + DOUBLE_CRLF.length);

        // Parse headers
        const nameMatch = headersStr.match(/name="([^"]+)"/);
        const filenameMatch = headersStr.match(/filename="([^"]+)"/);
        const ctMatch = headersStr.match(/Content-Type:\s*(.+)/i);

        parts.push({
            name: nameMatch?.[1],
            filename: filenameMatch?.[1],
            contentType: ctMatch?.[1]?.trim(),
            data,
        });

        // Move past this delimiter
        pos = nextDelimiterIdx + delimiter.length;
        // Check for end
        if (pos + 2 <= body.length && body[pos] === 0x2d && body[pos + 1] === 0x2d) break; // "--" ending
        if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;
    }

    return parts;
}

function indexOf(buf: Buffer, search: Buffer, startPos: number): number {
    for (let i = startPos; i <= buf.length - search.length; i++) {
        let found = true;
        for (let j = 0; j < search.length; j++) {
            if (buf[i + j] !== search[j]) {
                found = false;
                break;
            }
        }
        if (found) return i;
    }
    return -1;
}
