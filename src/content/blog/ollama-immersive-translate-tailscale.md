---
title: "Using Local Ollama as an OpenAI-Compatible Backend for Immersive Translate Chrome Plugin: Debugging Notes and Final Setup"
description: "A deep dive into connecting Immersive Translate browser extension to a remote Ollama instance, covering CORS issues, browser security policies, and the final Tailscale + HTTPS solution."
pubDate: 2026-04-11
tags: ["ai", "ollama", "tailscale", "debugging", "self-hosting"]
author: "Liam"
---

# Using Local Ollama as an OpenAI-Compatible Backend for Immersive Translate Chrome Plugin: Debugging Notes and Final Setup

## Background

I was running Ollama on a remote Linux machine with the `qwen3.5:9b` model, and I wanted to use it from the Immersive Translate browser extension through an OpenAI-compatible API.

The goal was straightforward:

- Run Ollama on a remote server
- Access it from a browser extension through an OpenAI-style API
- Avoid exposing the raw LAN port if possible
- Disable thinking to reduce translation latency

The final working endpoint looked like this:

```text
https://<your-tailnet-node>.ts.net/v1/chat/completions
```

## What I Was Trying to Do at First

The first thing I checked was whether Ollama was actually running correctly on the remote machine and whether inference was using the GPU.

I ran:

```bash
ollama ps
```

And saw:

```text
PROCESSOR    100% GPU
```

That confirmed `qwen3.5:9b` was running fully on GPU rather than falling back to CPU.

After that, I tried to point Immersive Translate directly at Ollama's OpenAI-compatible endpoint:

```text
http://<server-lan-ip>:11434/v1/chat/completions
```

## Problem 1: Ollama Was Only Reachable Locally on the Server

On the server itself, this worked:

```bash
curl http://127.0.0.1:11434/api/tags
```

But from my own machine, this initially failed:

```bash
curl http://<server-lan-ip>:11434/api/tags
```

### Why It Happened

Ollama was only listening on the loopback interface:

```bash
ss -lntp | grep 11434
```

It showed:

```text
127.0.0.1:11434
```

That meant:

- The server itself could access Ollama
- Other devices on the LAN could not

### How I Fixed It

I added environment variables to `ollama.service` through `systemd`:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
```

Then I restarted the service.

### Why This Fix Made Sense

- `OLLAMA_HOST=0.0.0.0:11434` makes Ollama listen on the LAN
- `OLLAMA_ORIGINS=*` allows cross-origin access from browser-based clients

After that, this worked from my own machine:

```bash
curl http://<server-lan-ip>:11434/api/tags
```

## Problem 2: The Browser Extension Still Failed with `Failed to fetch`

Even though `curl` was working, Immersive Translate still failed when I clicked "Test Service".

In the browser console, I saw:

```text
TypeError: Failed to fetch
```

In the Network panel, the target request was:

```text
http://<server-lan-ip>:11434/v1/chat/completions
```

### What I Suspected at First

At first I considered a few possibilities:

- The OpenAI-compatible URL path was wrong
- The API key was configured incorrectly
- The model was simply too slow
- CORS was not configured correctly

### What the Investigation Actually Showed

I tested the CORS preflight manually:

```bash
curl -i -X OPTIONS 'http://<server-lan-ip>:11434/v1/chat/completions' \
  -H 'Origin: chrome-extension://test' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type,api-key'
```

The response included:

```text
Access-Control-Allow-Origin: chrome-extension://test
```

But it did not allow the `api-key` request header.

The browser extension was actually sending:

```text
Api-Key: ollama
Authorization: Bearer ollama
Content-Type: application/json
```

### Root Cause

This was a classic browser CORS preflight failure:

- The extension wanted to send `Api-Key`
- The server did not allow `Api-Key` in `Access-Control-Allow-Headers`
- The browser blocked the request before it was actually sent

### How I Fixed It

I removed the API key from the extension configuration so it would stop sending the `Api-Key` header.

### Why This Fix Made Sense

The problem was not the API key value. The problem was the header name itself. Removing that header was the most direct client-side workaround.

## Problem 3: Even Without API Key, Direct LAN Access Was Still Unstable

Even after removing `Api-Key`, requests to `<server-lan-ip>` were still unreliable and sometimes failed with:

```text
Failed to fetch
```

In some cases, it looked like the browser blocked the request before the server ever produced a real response.

### Why I Thought This Was Happening

At that point, this no longer looked like a simple CORS issue. It looked more like the browser being stricter about requests to private LAN addresses.

The key points were:

- `<server-lan-ip>` is an RFC1918 private address
- Browser extensions still operate inside the browser's networking security model
- Accessing a private IP is often more problematic than accessing `localhost`

### How I Tested a Better Path First: SSH Tunneling

I used an SSH host alias from `~/.ssh/config` and created a local port forward:

```bash
ssh -N -L 11434:127.0.0.1:11434 <your-ssh-host-alias>
```

Then I changed the extension endpoint to:

```text
http://127.0.0.1:11434/v1/chat/completions
```

### Why This Worked Better

From the browser's point of view, it was now talking to a local service:

```text
Browser extension -> 127.0.0.1 -> SSH tunnel -> remote 127.0.0.1:11434
```

The browser was no longer directly dealing with a private LAN IP, and compatibility became much better.

This path worked reliably.

## Problem 4: The Model Was Still "Thinking" Too Much and Translation Was Slow

Once the API path worked, another issue became obvious: responses included a large `reasoning` field, which made translation slower than I wanted.

For example, the response looked like this:

```json
"message": {
  "role": "assistant",
  "content": "Hello, world",
  "reasoning": "Thinking Process: ..."
}
```

### What I Thought at First

I initially considered:

- The system prompt might be too long
- The temperature might be too high
- The model itself might simply be slow

These can affect latency, but they were not the core issue here.

### What Was Actually Happening

`qwen3.5:9b` was using thinking, and the browser extension was not sending any parameter to disable it.

The actual request payload captured in the browser was:

```json
{
  "model": "qwen3.5:9b",
  "temperature": 0,
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ]
}
```

It did not include:

```json
"think": false
```

And it also did not include:

```json
"reasoning_effort": "none"
```

### How I Verified the Problem Was on the Client Side

I sent the request manually with `curl`:

```bash
curl http://127.0.0.1:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3.5:9b",
    "messages": [{"role":"user","content":"Hello"}],
    "think": false
  }'
```

That response came back without any `reasoning` field.

So the conclusion was clear:

- The server supported disabling thinking
- The extension was simply not sending the required parameter

### Final Client-Side Fix

Based on Immersive Translate's advanced configuration options, I added a model-specific override under `openai-custom`:

```json
"modelsOverrides": [
  {
    "models": ["qwen3.5:9b"],
    "bodyConfigs": {
      "think": false
    }
  }
]
```

This made the extension include the disable-thinking parameter in the actual request body, and latency improved noticeably.

### Why This Was the Right Fix

This solved the problem at the client layer:

- No extra proxy was needed on the server
- No request rewriting layer was needed in front of Ollama
- The behavior was scoped to a specific model

## Final Setup: Tailscale + Domain + HTTPS

The SSH tunnel worked, but it had two obvious drawbacks:

- I had to keep the tunnel alive
- It was not elegant as a long-term setup

So I moved to a better final setup:

- Both machines joined the same Tailscale tailnet
- I enabled MagicDNS
- I enabled HTTPS certificates
- I used `tailscale serve` on the remote machine

The command was:

```bash
sudo tailscale serve --bg --https=443 http://127.0.0.1:11434
```

This gave me a stable URL:

```text
https://<your-tailnet-node>.ts.net/
```

The extension now uses:

```text
https://<your-tailnet-node>.ts.net/v1/chat/completions
```

### Why This Ended Up Being the Best Solution

It solved several problems at once:

1. No more dependency on a private LAN IP

The browser sees a standard HTTPS domain rather than a raw private IP.

2. No more SSH tunnel dependency

There is no need to keep `ssh -L` running manually.

3. Ollama can keep listening only on localhost

The service still stays on:

```text
127.0.0.1:11434
```

So Ollama does not need to be exposed directly to the entire LAN.

4. Better fit for browser and extension expectations

`HTTPS + domain` is generally more compatible than `private IP + custom port`.

5. Persistent background setup

With:

```bash
sudo tailscale serve --bg --https=443 http://127.0.0.1:11434
```

The service stays available in the background without requiring an interactive terminal session.

## What Tailscale Is Doing Under the Hood

The final request path looks roughly like this:

```text
Immersive Translate
-> https://<your-tailnet-node>.ts.net/v1/chat/completions
-> Tailscale Serve
-> http://127.0.0.1:11434
-> Ollama
```

Tailscale provides several pieces here:

- A WireGuard-based encrypted overlay network
- MagicDNS for stable device names
- HTTPS certificates
- `tailscale serve` to proxy tailnet HTTPS traffic to a local service

So the browser ends up talking to a standard HTTPS service, not a bare port on a private LAN IP.

## Key Lessons From This Debugging Session

### 1. `curl` working does not mean a browser extension will work

`curl` is not subject to browser security policies. Browser extensions still go through CORS, preflight behavior, and local-network-related restrictions.

### 2. Separate server-side failures from browser-side failures early

If local `curl` works, remote `curl` works, and the extension still fails, the browser layer is the first thing to suspect.

### 3. The actual request payload matters more than the configuration file

A setting is only real if it shows up in the captured request payload. Browser DevTools are the source of truth.

### 4. `localhost` and `192.168.x.x` are not equivalent from the browser's point of view

They may both be "local" in a human sense, but the browser does not treat them the same way.

### 5. Standard access patterns are better long-term

If something is meant to be consumed by a browser or browser extension, these tend to win:

- Stable domain names
- HTTPS
- Avoiding direct exposure of raw backend ports

That is usually more robust than patching around a private IP setup.

## Final Configuration Summary

### Server Side

- Ollama runs on a remote Linux machine
- Model: `qwen3.5:9b`
- Ollama listens on: `127.0.0.1:11434`
- Tailscale Serve endpoint: `https://<your-tailnet-node>.ts.net`

### Extension Side

- API URL:

```text
https://<your-tailnet-node>.ts.net/v1/chat/completions
```

- Model:

```text
qwen3.5:9b
```

- Disable thinking:

```json
"modelsOverrides": [
  {
    "models": ["qwen3.5:9b"],
    "bodyConfigs": {
      "think": false
    }
  }
]
```

## Conclusion

This was not really about "how to make a model run." It was about how to make a browser extension talk to a remotely hosted local-model service in a way that is stable, low-latency, and maintainable.

The hard part turned out not to be the model itself, but browser security rules, API compatibility, and deployment shape.

The final choice, `Tailscale + HTTPS + domain + localhost-bound Ollama`, worked well because it provided:

- Stability
- Better security
- No raw LAN port exposure
- Better browser compatibility
- Lower maintenance overhead

If I had to do the same kind of setup again for a browser extension talking to a home or remote LLM server, I would start with this architecture instead of exposing a private IP first and fixing issues one by one.
