import { defineContentScript } from "wxt/utils/define-content-script";

export default defineContentScript({
  matches: ["https://arxiv.org/*"],
  runAt: "document_idle",
  main() {},
});
