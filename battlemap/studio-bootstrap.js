/* Battlemap Studio v1.406 shared-scope bootstrap.
   Keep the extracted source files separately editable on GitHub while
   executing them in the original single function scope. */
(function () {
  "use strict";
  const parts = [
    "./map-composer.js",
    "./map-composer-crop.js",
    "./map-composer-renderer.js",
    "./map-composer-editor.js",
    "./studio-biological.js",
    "./studio-webgl.js",
    "./studio-engine.js",
    "./studio-path-benchmark.js",
    "./tactical-discovery.js",
    "./studio-interactions.js",
    "./studio-room-sync.js"
  ];
  Promise.all(parts.map(async path => {
    const build = document.getElementById("battlemapBuild")?.textContent.trim() || "unknown";
    const url = new URL(path, document.baseURI);
    url.searchParams.set("build", build);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(path + " returned HTTP " + response.status);
    return response.text();
  })).then(sources => {
    // A single function scope is essential: these scripts share lexical
    // declarations (including 'top', 'el', and 'chatFilterIds').
    const combined = "(function () {\n" + sources.join("\n;\n") + "\n})();\n";
    const blob = new Blob([combined], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => URL.revokeObjectURL(url);
    script.onerror = () => {
      URL.revokeObjectURL(url);
      showFailure("The combined Battlemap Studio script could not execute.");
    };
    document.body.appendChild(script);
  }).catch(error => showFailure(error.message || String(error)));
  function showFailure(message) {
    console.error("Battlemap Studio startup failed:", message);
    const banner = document.createElement("div");
    banner.setAttribute("role", "alert");
    banner.style.cssText = "position:fixed;z-index:999999;top:12px;left:12px;right:12px;padding:16px;background:#5b1820;color:white;border:2px solid #f7a0a0;font:14px system-ui";
    banner.textContent = "Battlemap Studio could not start: " + message;
    document.body.appendChild(banner);
  }
})();
