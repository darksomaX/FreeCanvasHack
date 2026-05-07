# CanvasHack

Privacy protection and quiz tools for Canvas LMS. Free, open source, runs entirely in your browser with no remote servers.

## Features

### Privacy Guard

Prevents Canvas from detecting tab-switching, window switching, and loss of focus during quizzes and tests.

- Overrides `document.visibilityState` to always return `"visible"`
- Overrides `document.hidden` to always return `false`
- Overrides `Document.hasFocus()` to always return `true`
- Intercepts `addEventListener` on `EventTarget`, `Document`, `Window`, and `Element` prototypes to silently block registration of tracking events (`focus`, `blur`, `visibilitychange`, `mouseleave`, `pagehide`, `freeze`, `resume`, and more)
- Overrides `addEventListener` directly on the `document` and `window` instances as a fallback for Chrome's native bindings
- Intercepts `dispatchEvent` to block programmatic firing of tracked events

Canvas scripts that try to listen for these events will never receive them. The page always appears active and focused.

### Answer Saver

Automatically fetches your previous quiz submission history from your school's Canvas API, identifies your highest-scoring answers for each question, and auto-fills them when you hover over the question.

Supported question types:
- Multiple choice / True-false
- Fill-in-the-blank
- Multiple answers (checkboxes)
- Matching
- Numerical / Formula
- Essay (rich text editor)

This only calls your school's Canvas instance. It does not connect to any external server.

### Kiosk Spoof

Injects a fake Canvas Kiosk App navigation bar at the top of your tab, making it appear as though you are running the locked-down kiosk browser that some institutions require for testing.

### AI Answer Engine

Connects to your own LLM API to answer quiz questions. Supports any OpenAI-compatible endpoint including OpenAI, OpenRouter, Google Gemini, Groq, Together AI, Hugging Face, Mistral AI, DeepSeek, Cloudflare Workers AI, Cohere, and local models via Ollama.

Three answer modes:

| Mode | Behavior |
|------|----------|
| Hover Hint | Hover over a question and the AI highlights the correct answer with a green tint and shows it in a tooltip |
| Right-Click | Right-click on any question to get the answer in a draggable floating box with a copy button |
| Keybind Type | Hover over a question and press a configurable key (default Y) to auto-type the AI answer character by character into the input field |

For multiple choice questions the AI automatically selects the correct option. For text and essay questions it types the answer.

Your API key is stored in `chrome.storage.local` and is only sent to the endpoint you configure.

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** using the toggle in the top right
4. Click **Load unpacked** and select the `canvashack` folder
5. The extension icon will appear in your toolbar

### Required setting for local test page

If you want to use the included test page (`test-page.html`):

1. Go to `chrome://extensions/`
2. Find CanvasHack and click **Details**
3. Enable **"Allow access to file URLs"**
4. Reload the extension

### AI Setup

1. Click the extension icon to open the popup
2. Click the **AI Answer Engine** card
3. Either paste your API key (the provider will be auto-detected from the key format) or select a provider from the dropdown
4. Select a model from the dropdown or enter a custom model name
5. Click **Test Connection** to verify your setup
6. Choose an answer mode (Hover, Right-Click, or Keybind)
7. Click **Save AI Settings**

## Testing

A test page is included at `test-page.html` that mimics Canvas quiz HTML structure. Open it in Chrome to test all features:

- 10 questions of various types (multiple choice, true/false, fill-in-blank, numerical, essay)
- Click answers and submit to receive a graded score
- A monitoring panel on the right side shows what Canvas would report to a teacher
- If Privacy Guard is working, events show as green "BLOCKED" entries
- If Privacy Guard is not working, events show as red "LEAKED" entries

## Project Structure

```
canvashack/
  manifest.json      Extension manifest (Manifest V3)
  background.js      Service worker - message handling, API test proxy
  inject.js          MAIN world script - overrides visibility/focus APIs
  content.js         Content script - injects inject.js, kiosk bar, UI toggles
  quizanswers.js     Content script - auto-fills answers from Canvas API
  ai-answers.js      Content script - AI-powered answer system
  popup.html         Extension popup HTML
  popup.css          Extension popup styles
  popup.js           Extension popup logic
  test-page.html     Local test page mimicking Canvas quiz
  README.md          This file
  icons/             Extension icons
  images/            UI images
```

### How files interact

`inject.js` runs in the MAIN world (the same JavaScript context as the page). It is injected statically via the manifest's `content_scripts` with `"world": "MAIN"` and `"run_at": "document_start"`, which guarantees it executes before any page scripts. Content scripts (`content.js`, `quizanswers.js`, `ai-answers.js`) run in an isolated world and communicate with the page only through shared DOM.

```
manifest.json
  content_scripts[0]: inject.js  -> MAIN world, document_start
  content_scripts[1]: content.js -> isolated world, document_start
  content_scripts[2]: quizanswers.js + ai-answers.js -> isolated world, document_idle (quiz pages only)

popup.js <-> background.js (message passing for API test proxy)
content.js <-> popup.js (chrome.storage for settings)
```

## Configuration

All settings are stored locally in `chrome.storage.local`:

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Master toggle for Privacy Guard |
| `privacyGuardEnabled` | `true` | Privacy Guard on/off |
| `saveCorrectAnswers` | `true` | Answer Saver on/off |
| `injectQuizAnswers` | `true` | Quiz answer auto-fill on/off |
| `showInjectedUI` | `true` | Show on-page toolbar |
| `blockedUrls` | `[]` | URLs where the extension should not run |
| `aiApiEndpoint` | `""` | LLM API endpoint URL |
| `aiApiKey` | `""` | LLM API key |
| `aiModel` | `""` | Model name to use |
| `aiMode` | `"off"` | Answer mode: off, hover, rightclick, keybind |
| `aiTypeKeybind` | `"y"` | Key to trigger auto-type |
| `aiAutoTypeSpeed` | `50` | Milliseconds between characters when auto-typing |

## Privacy

The extension makes zero connections to any external server operated by the extension authors. All features run in your browser:

- Privacy Guard overrides local browser APIs only
- Answer Saver calls your school's Canvas instance only
- Kiosk Spoof is purely local DOM injection
- AI Answers calls only the endpoint you configure
- API keys are stored in `chrome.storage.local` and never sent anywhere except your chosen endpoint

## Supported Providers

| Provider | Key Prefix | Endpoint |
|----------|-----------|----------|
| OpenAI | `sk-` | api.openai.com/v1/chat/completions |
| Google Gemini | `AIza` | generativelanguage.googleapis.com |
| Groq | `gsk_` | api.groq.com/openai/v1/chat/completions |
| OpenRouter | `sk-or-` | openrouter.ai/api/v1/chat/completions |
| Hugging Face | `hf_` | api-inference.huggingface.co |
| Together AI | `together_` | api.together.xyz/v1/chat/completions |
| Cohere | `co-` | api.cohere.com |
| Mistral AI | `mistral-` | api.mistral.ai/v1/chat/completions |
| DeepSeek | `dsk-` | api.deepseek.com/v1/chat/completions |
| Cloudflare | `cf-` | api.cloudflare.com/client/v4/accounts/... |
| Ollama | (none) | localhost:11434/v1/chat/completions |

Any OpenAI-compatible endpoint works. Select "Custom provider" to enter your own URL and model name.

## License

Free and open source.
