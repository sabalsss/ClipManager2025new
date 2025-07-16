// contentScript.js

(() => {
  if (window.__clipboardManagerInjected) return;
  window.__clipboardManagerInjected = true;

  // Function to handle copy events (minimal chrome access)
  // Debounce/cooldown for copy events
  let lastCopyTime = 0;
  const COPY_COOLDOWN = 400; // ms

  function handleCopyEvent(event) {
    const now = Date.now();
    if (now - lastCopyTime < COPY_COOLDOWN) return;
    lastCopyTime = now;
    try {
      const selection = document.getSelection();
      if (selection) {
        const copiedText = selection.toString().trim();
        if (copiedText) {
          // Comprehensive check for chrome runtime availability
          if (typeof chrome !== 'undefined' && 
              chrome && 
              chrome.runtime && 
              typeof chrome.runtime.sendMessage === 'function') {
            try {
              chrome.runtime.sendMessage({ type: "copiedText", text: copiedText }, (response) => {
                // Handle any potential errors in the response
                if (chrome.runtime.lastError) {
                  console.log('Extension message error:', chrome.runtime.lastError.message);
                  // Remove the event listener if extension context is invalid
                  if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                    document.removeEventListener("copy", handleCopyEvent);
                  }
                }
              });
            } catch (error) {
              console.log('Extension communication error:', error.message);
              // Remove the event listener if there's a critical error
              document.removeEventListener("copy", handleCopyEvent);
            }
          } else {
            // Remove the event listener if chrome runtime is not available
            console.log('Chrome runtime not available, removing copy event listener');
            document.removeEventListener("copy", handleCopyEvent);
          }
        }
      }
    } catch (error) {
      console.log('Copy event handler error:', error.message);
      // Remove the event listener on any error
      document.removeEventListener("copy", handleCopyEvent);
    }
  }

  // Add the event listener immediately without any chrome checks
  // The handler will check chrome runtime when needed and remove itself if invalid
  document.addEventListener("copy", handleCopyEvent); 
})(); 