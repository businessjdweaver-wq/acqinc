# Unity tabletop bundle reader

`reader.js` is a browser IIFE built from the MIT-licensed
`unity-asset-reader@2.0.0`, `unity-asset-reader-mesh@2.0.0`, and
`lzma1@0.3.0`. Their license notices are included here. The Battlemap
worker loads this file only when reading a Unity bundle.

To regenerate it, install those versions and `esbuild@0.28.2` in a
temporary npm project. Save this entry module in that project:

```js
export { load, readBundle, decompressLz4 } from 'unity-asset-reader';
export { meshToGltf } from 'unity-asset-reader-mesh';
```

```sh
npx esbuild entry.mjs --bundle --format=iife --global-name=StudioUnityReader \
  --platform=browser --minify --legal-comments=none --outfile=reader.js
```
