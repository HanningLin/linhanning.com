# GitHub Pages 404 Incident Summary

## Overview

This incident was not caused by broken site code or incorrect DNS. The root cause was a bad cached variant of the homepage `/` on GitHub Pages' edge cache.

The important distinction was:

- the uncompressed homepage response returned `200`
- the compressed homepage response returned `404`
- other compressed pages such as `/about/` returned `200`

That means only one cache variant for one path was bad.

## What Happened

The repo was switched between private and public, GitHub Pages was re-enabled, and the custom domain was rebound. During that process, GitHub Pages and its CDN ended up serving inconsistent cache variants for the homepage.

The site eventually looked like this:

- `https://linhanning.com/` from normal `curl`: `200`
- `https://linhanning.com/` from browser: `404`
- `https://linhanning.com/about/` from browser-style compressed request: `200`

This pattern indicates a corrupted or stale compressed cache entry for the root path `/`.

## Why Browser And curl Behaved Differently

Browsers usually send:

```http
Accept-Encoding: gzip, br, zstd
```

This asks the server or CDN for a compressed response.

`curl` without `--compressed` usually does not request the same compressed variant, so it can receive a different cached object even for the same URL.

We verified exactly that:

```bash
curl -I https://linhanning.com
# 200

curl -I --compressed https://linhanning.com
# 404
```

So the difference was not the URL or DNS. The difference was the response variant selected by `Accept-Encoding`.

## What `Vary: Accept-Encoding` Means

The response included:

```http
Vary: Accept-Encoding
```

This tells caches to keep separate entries for the same URL depending on whether the client asked for compression.

So these can be cached separately:

- `/` uncompressed
- `/` gzip
- `/` brotli

In this incident:

- the uncompressed cache entry for `/` was good
- the compressed cache entry for `/` was bad

## Why The Phone Worked But The Mac Browsers Did Not

The phone and the Mac did not necessarily hit the same edge cache state.

Possible reasons:

- the phone hit a different CDN edge node
- the phone hit the site later, after some cache propagation had improved
- the phone got a different compression or cache path

The important point is that both devices can request the same domain and still receive different cached results from the CDN.

## What We Ruled Out

We verified all of these were correct:

- GitHub Pages was enabled
- source was set to `GitHub Actions`
- custom domain was set to `linhanning.com`
- DNS for `linhanning.com` pointed to GitHub Pages IPs
- `www.linhanning.com` redirected correctly
- local Astro build succeeded
- `/etc/hosts` did not contain a bad override
- the browser was connecting to the correct GitHub Pages IP

## Key Evidence

DNS:

```text
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Browser request details:

- Request URL: `https://linhanning.com/`
- Status Code: `404 Not Found`
- Remote Address: `185.199.108.153:443`
- Server: `GitHub.com`

Command results:

```bash
curl -I https://linhanning.com
# HTTP/2 200

curl -I --compressed https://linhanning.com
# HTTP/2 404

curl -I --compressed https://linhanning.com/about/
# HTTP/2 200
```

## Why Restarting The Computer Did Not Help

Restarting the computer clears local state, but it does not fix a stale or corrupted CDN cache entry on GitHub Pages.

Because the bad response was coming from the remote cache layer, local DNS flushes and browser restarts were not sufficient.

## Code-Level Mitigation

To force GitHub Pages to regenerate the homepage output and republish the root path, a minimal homepage metadata change was made in:

- [src/pages/index.astro](/Users/hanninglin/code/linhanning.com/src/pages/index.astro:8)

The description was changed to trigger a new deployment for `/`.

Commit used:

- `dfee1b7` - `Refresh homepage metadata`

## Conclusion

The root cause was a bad compressed cache variant for `https://linhanning.com/` on GitHub Pages/CDN, not a code bug, not broken DNS, and not a local browser-only configuration issue.

The clean mental model is:

1. Same URL can have multiple cache variants.
2. Browsers usually request compressed variants.
3. One compressed variant for `/` was stale or corrupted and returned `404`.
4. Non-compressed requests still returned `200`.
5. Republishing the homepage was the right code-level mitigation.
