async function requestJson(serverUrl, path, options = {}) {
  const targetUrl = new URL(path, serverUrl).toString();
  const response = await fetch(targetUrl, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(payload?.error || `Hosting request failed with status ${response.status}.`);
  }

  return payload;
}

export async function startCloudflareQuickTunnel({ serverUrl, clientTargetUrl, serverTargetUrl }) {
  return requestJson(serverUrl, "/api/hosting/cloudflare/quick-start", {
    method: "POST",
    body: {
      clientTargetUrl,
      serverTargetUrl,
    },
  });
}

export async function stopCloudflareQuickTunnel({ serverUrl }) {
  return requestJson(serverUrl, "/api/hosting/cloudflare/stop", {
    method: "POST",
  });
}

export async function getHostingStatus({ serverUrl }) {
  return requestJson(serverUrl, "/api/hosting/status");
}
