/* ==============================
   SUMMARIZE BUTTON
============================== */
document.getElementById("summarize").addEventListener("click", async () => {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML =
    '<div class="loading"><div class="loader"></div></div>';

  const summaryType = document.getElementById("summary-type").value;

  // Get API key
  const { geminiApiKey } = await chrome.storage.sync.get(["geminiApiKey"]);

  if (!geminiApiKey) {
    resultDiv.innerText =
      "API key not found. Please set your API key in the extension options.";
    return;
  }

  // Get active tab
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab || !tab.id) {
    resultDiv.innerText = "No active tab found.";
    return;
  }

  try {
    const response = await sendMessageToTab(tab.id);

    if (!response || !response.text) {
      resultDiv.innerText =
        "Could not extract article text from this page.";
      return;
    }

    const summary = await getGeminiSummary(
      response.text,
      summaryType,
      geminiApiKey
    );

    resultDiv.innerText = summary;
  } catch (error) {
    resultDiv.innerText =
      error.message || "Something went wrong.";
  }
});


/* ==============================
   SAFE MESSAGE FUNCTION
============================== */
async function sendMessageToTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "GET_ARTICLE_TEXT" },
      async (response) => {
        if (chrome.runtime.lastError) {
          try {
            // Inject content.js dynamically
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ["content.js"],
            });

            // Retry
            chrome.tabs.sendMessage(
              tabId,
              { type: "GET_ARTICLE_TEXT" },
              (retryResponse) => {
                if (chrome.runtime.lastError) {
                  reject(
                    new Error(
                      "Cannot access this page. Try a normal website."
                    )
                  );
                } else {
                  resolve(retryResponse);
                }
              }
            );
          } catch (err) {
            reject(
              new Error(
                "Failed to inject content script. Check permissions."
              )
            );
          }
        } else {
          resolve(response);
        }
      }
    );
  });
}


/* ==============================
   GEMINI API CALL (v1beta)
============================== */
async function getGeminiSummary(text, summaryType, apiKey) {
  const maxLength = 20000;
  const truncatedText =
    text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;

  let prompt;

  switch (summaryType) {
    case "brief":
      prompt = `Provide a brief summary in 2-3 sentences:\n\n${truncatedText}`;
      break;
    case "detailed":
      prompt = `Provide a detailed summary covering all key points:\n\n${truncatedText}`;
      break;
    case "bullets":
      prompt = `Summarize in 5-7 bullet points using "-" only:\n\n${truncatedText}`;
      break;
    default:
      prompt = `Summarize this article:\n\n${truncatedText}`;
  }

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,   // 🔥 Important
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const errorData = await res.json();
    console.error("Gemini Error:", errorData);
    throw new Error(errorData.error?.message || "API request failed");
  }

  const data = await res.json();

  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "No summary available."
  );
}


/* ==============================
   COPY BUTTON
============================== */
document.getElementById("copy-btn").addEventListener("click", () => {
  const summaryText = document.getElementById("result").innerText;

  if (summaryText && summaryText.trim() !== "") {
    navigator.clipboard.writeText(summaryText).then(() => {
      const copyBtn = document.getElementById("copy-btn");
      const originalText = copyBtn.innerText;

      copyBtn.innerText = "Copied!";
      setTimeout(() => {
        copyBtn.innerText = originalText;
      }, 2000);
    });
  }
});