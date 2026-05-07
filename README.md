# FreeCanvasHack

Privacy protection and quiz tools for Canvas LMS. Free, open source, runs entirely in your browser with no remote servers.

> **Status: Work in Progress** — The core Privacy Guard is functional. The AI Answer Engine is partially working and needs further testing. Not all features are verified on live Canvas yet. Use at your own risk and test locally before relying on it.

## Features

### Privacy Guard

Prevents Canvas from detecting tab-switching, window switching, and loss of focus during quizzes and tests.

- Overrides `document.visibilityState` to always return `"visible"`
- Overrides `document.hidden` to always return `false`
- Overrides `Document.prototype.hasFocus()` to always return `true`
- Intercepts `addEventListener` on prototypes and `document`/`window` instances to silently block registration of tracking events (`focus`, `blur`, `visibilitychange`, `mouseleave`, `pagehide`, `paste`, `copy`, `cut`, `freeze`, `resume`, and more)
- Intercepts `dispatchEvent` to block programmatic firing of tracked events
- Runs synchronously at `document_start` before any page scripts can register listeners

### Killswitch

If the Privacy Guard is removed, bypassed, or the page tries to unpatch the overrides, the killswitch immediately replaces the page with a fake Chrome "Aw, Snap! OUT_OF_MEMORY" crash screen. This prevents Canvas from detecting that you were ever unprotected.

### Answer Saver

Automatically fetches your previous quiz submission history from your school's Canvas API, identifies your highest-scoring answers for each question, and auto-fills them when you hover over the question.

Supported question types: Multiple choice, True/false, Fill-in-the-blank, Multiple answers, Matching, Numerical, Essay.

### Kiosk Spoof

Injects a fake Canvas Kiosk App navigation bar at the top of your tab.

### AI Answer Engine

Connects to your own LLM API to answer quiz questions. Supports any OpenAI-compatible endpoint.

Three answer modes:

| Mode | Behavior |
|------|----------|
| Hover Hint | Hover over a question to see the AI-highlighted correct answer |
| Right-Click | Right-click on a question to auto-fill the answer |
| Keybind Type | Hover over a question and press a key to auto-type the answer |

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the `canvashack` folder
5. The extension icon will appear in your toolbar

### Required setting for local test page

If you want to use the included test page (`test-page.html`):

1. Go to `chrome://extensions/`
2. Find CanvasHack and click **Details**
3. Enable **"Allow access to file URLs"**
4. Reload the extension

## Getting an API Key (for AI Answer Engine)

The AI feature requires an API key from an LLM provider. Recommended free option:

### OpenRouter (Free Models Available)

1. Go to [openrouter.ai](https://openrouter.ai)
2. Create a free account
3. Go to **Keys** in your dashboard
4. Click **Create Key** and copy it (starts with `sk-or-`)
5. In the CanvasHack popup, paste the key — OpenRouter is auto-detected
6. Select a free model (look for the **(Free)** label)
7. Click **Test Connection** to verify

Other supported providers: OpenAI, Google Gemini, Groq, Together AI, Hugging Face, Mistral AI, DeepSeek, Cohere, Cloudflare Workers AI, and local models via Ollama.

### AI Setup Steps

1. Click the CanvasHack extension icon to open the popup
2. Click the **AI Answer Engine** card
3. Paste your API key (provider auto-detected from key format) or select from dropdown
4. Select a model
5. Click **Test Connection** to verify
6. Choose an answer mode
7. Click **Save AI Settings**

## Testing

A test page is included at `test-page.html`. Open it via `file://` in Chrome to test:

- 10 questions of various types
- Click answers and submit for grading
- Right panel simulates what Canvas would report to a teacher
- Green = BLOCKED (guard working), Red = LEAKED (guard broken)
- Open browser console and run `testAutoType()` to test auto-type mechanism
- Run `testAPI()` to test your API connection from the page

## Project Structure

```
canvashack/
  manifest.json      Extension manifest (Manifest V3)
  background.js      Service worker — message handling, API test proxy
  content.js         Content script — injects guard, kiosk bar, feature scripts
  inject.js          MAIN world — overrides visibility/focus, blocks events
  quizanswers.js     MAIN world — auto-fills from Canvas API submissions
  ai-answers.js      MAIN world — AI-powered answer system
  popup.html/js/css  Extension popup dashboard
  test-page.html/js  Local test page mimicking Canvas quiz
  README.md          This file
```

### How files interact

`content.js` runs in the isolated content script world at `document_start`. It immediately (synchronously) reads `inject.js` via XHR and injects it into the MAIN world via `script.textContent`. This guarantees `inject.js` runs before any page scripts. Feature scripts (`quizanswers.js`, `ai-answers.js`) are injected later as `<script src>` elements after async settings load.

```
content.js (isolated, document_start)
  ├─ Phase 1 (sync): inject.js → MAIN world via script.textContent
  └─ Phase 2 (async): quizanswers.js, ai-answers.js → MAIN world via script src

popup.js ↔ background.js (message passing for API test)
popup.js → chrome.storage.local → content.js
```

## Configuration

Settings stored in `chrome.storage.local`:

| Key | Default | Description |
|-----|---------|-------------|
| `answerSaver` | `true` | Fetch and auto-fill previous best answers |
| `privacyGuard` | `true` | Privacy guard on/off |
| `killswitch` | `true` | Crash page if guard is removed |
| `kioskSpoof` | `false` | Show fake kiosk browser bar |
| `aiMode` | `"off"` | Answer mode: off, hover, rightclick, keybind |
| `aiProvider` | `"openrouter"` | Auto-detected LLM provider |
| `aiApiKey` | `""` | Your API key |
| `aiModel` | `"google/gemma-4-26b-a4b-it:free"` | Default model |
| `aiEndpoint` | OpenRouter URL | API endpoint |
| `aiKeybind` | `"y"` | Key to trigger auto-type |
| `aiAutoTypeSpeed` | `50` | Milliseconds between characters |
| `blockedUrls` | `[]` | URLs to skip |
| `showInjectedUI` | `true` | Show on-page UI |

## Privacy

The extension makes zero connections to any external server operated by the extension authors. All features run in your browser:

- Privacy Guard overrides local browser APIs only
- Answer Saver calls your school's Canvas instance only
- Kiosk Spoof is purely local DOM injection
- AI Answers calls only the endpoint you configure
- API keys are stored in `chrome.storage.local` and never sent anywhere except your chosen endpoint

## License

Free and open source.
