// WorkBridge ETH — Frontend configuration
//
// HOW TO USE:
//   1. Copy this file to `config.js` in the same directory as index.html.
//   2. Edit WB_API_BASE to point at your deployed backend.
//   3. In index.html, the inline script BEFORE <script src="js/api.js"> will
//      read WB_API_BASE from window if it's already set, otherwise it falls
//      back to localhost. So just creating config.js is enough — load it
//      BEFORE js/api.js.
//
//   The easiest place to add the script tag is right after the <head> opens:
//     <script src="config.js"></script>
//
//   (Don't add it after api.js — the client would have already cached the
//   localhost default.)
//
// If you're running the API on the same domain (e.g. behind a reverse proxy
// or on Vercel/Netlify with rewrites), you can leave WB_API_BASE as a
// relative path like '/api' instead of a full URL.

window.WB_API_BASE = 'https://your-backend.example.com/api';
