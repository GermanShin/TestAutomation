import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.ALLURE_BUCKET_NAME!;

interface AllureReport {
  key: string;
  lastModified: Date;
  size: number;
  reportName: string;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const path = event.path || "/";
    const userEmail =
      event.requestContext.authorizer?.claims?.email || "unknown";

    console.log(`Request from ${userEmail}: ${path}`);
    console.log(`S3 Bucket: ${BUCKET_NAME}`);

    // Route handling
    if (path === "/" || path === "/oauth2/idpresponse") {
      return await handleDashboard();
    } else if (path.startsWith("/report/")) {
      return await handleReportFile(path);
    }

    return {
      statusCode: 404,
      headers: { "Content-Type": "text/html" },
      body: "<h1>404 - Not Found</h1>",
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: `<h1>Error</h1><pre>${JSON.stringify(error, null, 2)}</pre>`,
    };
  }
};

async function handleDashboard(): Promise<APIGatewayProxyResult> {
  console.log("Fetching reports from S3...");

  // List all reports from S3
  const reports = await listReports();

  console.log(`Found ${reports.length} reports`);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Allure Reports Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 2rem;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            text-align: center;
        }
        h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
        .subtitle { opacity: 0.9; font-size: 1.1rem; }
        .content { padding: 2rem; }
        .info-banner {
            background: #f0f4ff;
            border-left: 4px solid #667eea;
            padding: 1rem 1.5rem;
            margin-bottom: 2rem;
            border-radius: 4px;
        }
        .info-banner code {
            background: #e0e7ff;
            padding: 0.2rem 0.5rem;
            border-radius: 3px;
            font-size: 0.9rem;
        }
        .reports-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-top: 2rem;
        }
        .report-card {
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            padding: 1.5rem;
            transition: all 0.3s ease;
            background: #f8fafc;
        }
        .report-card:hover {
            border-color: #667eea;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
            transform: translateY(-2px);
        }
        .report-name {
            font-size: 1.25rem;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 0.75rem;
            word-break: break-word;
        }
        .report-meta {
            color: #64748b;
            font-size: 0.875rem;
            margin-bottom: 1rem;
        }
        .report-link {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 500;
            transition: all 0.3s ease;
        }
        .report-link:hover {
            transform: translateX(4px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        .no-reports {
            text-align: center;
            padding: 4rem 2rem;
            color: #64748b;
        }
        .no-reports h2 { margin-bottom: 1rem; color: #475569; }
        .bucket-info {
            background: #f9fafb;
            padding: 1rem;
            border-radius: 6px;
            margin-top: 1rem;
            font-family: monospace;
            font-size: 0.875rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🎭 Allure Reports Dashboard</h1>
            <p class="subtitle">View your test execution reports</p>
        </header>
        <div class="content">
            <div class="info-banner">
                <strong>📦 S3 Bucket:</strong> <code>${BUCKET_NAME}</code>
            </div>
            ${
              reports.length > 0
                ? `
                <div class="reports-grid">
                    ${reports
                      .map(
                        (report) => `
                        <div class="report-card">
                            <div class="report-name">${report.reportName}</div>
                            <div class="report-meta">
                                📅 ${report.lastModified.toLocaleDateString()} ${report.lastModified.toLocaleTimeString()}<br>
                                📦 ${formatBytes(report.size)}
                            </div>
                            <a href="/report/${
                              report.key
                            }/index.html" class="report-link">
                                View Report →
                            </a>
                        </div>
                    `
                      )
                      .join("")}
                </div>
            `
                : `
                <div class="no-reports">
                    <h2>No Reports Available</h2>
                    <p>Upload your first Allure report to get started!</p>
                    <div class="bucket-info">
                        <strong>Upload Structure:</strong><br>
                        s3://${BUCKET_NAME}/your-report-name/index.html<br>
                        s3://${BUCKET_NAME}/your-report-name/styles.css<br>
                        s3://${BUCKET_NAME}/your-report-name/app.js
                    </div>
                    <p style="margin-top: 1.5rem; color: #64748b;">
                        Example:<br>
                        <code style="background: #f1f5f9; padding: 0.5rem; display: inline-block; margin-top: 0.5rem; border-radius: 4px;">
                        aws s3 cp index.html s3://${BUCKET_NAME}/test-report-2024-02-08/index.html
                        </code>
                    </p>
                </div>
            `
            }
        </div>
    </div>
</body>
</html>
  `;

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: html,
  };
}

async function listReports(): Promise<AllureReport[]> {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Delimiter: "/",
    });

    const response = await s3Client.send(command);
    const reports: AllureReport[] = [];

    console.log(
      `S3 Response - CommonPrefixes: ${response.CommonPrefixes?.length || 0}`
    );

    // Assuming reports are organized as folders: report-name/index.html
    if (response.CommonPrefixes) {
      for (const prefix of response.CommonPrefixes) {
        const folderName = prefix.Prefix?.replace("/", "") || "";
        if (folderName) {
          console.log(`Checking folder: ${folderName}`);

          // Get index.html info from this folder
          try {
            const indexKey = `${folderName}/index.html`;
            const headCommand = new ListObjectsV2Command({
              Bucket: BUCKET_NAME,
              Prefix: indexKey,
              MaxKeys: 1,
            });
            const headResponse = await s3Client.send(headCommand);

            if (headResponse.Contents && headResponse.Contents.length > 0) {
              const obj = headResponse.Contents[0];
              console.log(`Found index.html in ${folderName}`);
              reports.push({
                key: folderName,
                lastModified: obj.LastModified || new Date(),
                size: obj.Size || 0,
                reportName: folderName,
              });
            } else {
              console.log(`No index.html found in ${folderName}`);
            }
          } catch (err) {
            console.error(`Error checking ${folderName}:`, err);
          }
        }
      }
    }

    // Sort by last modified (newest first)
    return reports.sort(
      (a, b) => b.lastModified.getTime() - a.lastModified.getTime()
    );
  } catch (error) {
    console.error("Error listing reports:", error);
    return [];
  }
}

async function handleReportFile(path: string): Promise<APIGatewayProxyResult> {
  // Path format: /report/report-name/index.html or /report/report-name/data/...
  const filePath = path.replace("/report/", "");

  console.log(`Fetching file: ${filePath} from bucket: ${BUCKET_NAME}`);

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filePath,
    });

    const response = await s3Client.send(command);
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const contentType = getContentType(filePath);

    console.log(
      `Successfully fetched ${filePath}, size: ${buffer.length}, type: ${contentType}`
    );

    // Determine if we should base64 encode
    const isBinary =
      !contentType.includes("text") &&
      !contentType.includes("javascript") &&
      !contentType.includes("json") &&
      !contentType.includes("svg");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
      body: isBinary ? buffer.toString("base64") : buffer.toString("utf-8"),
      isBase64Encoded: isBinary,
    };
  } catch (error: any) {
    console.error("Error fetching file:", error);

    if (error.name === "NoSuchKey") {
      return {
        statusCode: 404,
        headers: { "Content-Type": "text/html" },
        body: `<h1>404 - File Not Found</h1><p>Could not find: ${filePath}</p>`,
      };
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: `<h1>Error Loading File</h1><pre>${JSON.stringify(
        error,
        null,
        2
      )}</pre>`,
    };
  }
}

function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types: { [key: string]: string } = {
    html: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    ttf: "font/ttf",
    woff: "font/woff",
    woff2: "font/woff2",
    eot: "application/vnd.ms-fontobject",
    txt: "text/plain; charset=utf-8",
    xml: "application/xml; charset=utf-8",
  };
  return types[ext || ""] || "application/octet-stream";
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
