import type { PageSource } from "../content/app";
import { detectSource } from "../source/source-id";
import { CaptionTracker } from "./caption-tracker";
import { watchUrl, youtubeSource } from "./youtube";

/** A YouTube page as a source of text: the captions on screen now, and the lines shown before them. */
export function createYouTubeSource(doc: Document, tracker: CaptionTracker = new CaptionTracker(doc)): PageSource {
  return {
    get url() {
      const id = tracker.currentVideoId();
      return id ? watchUrl(id) : doc.location.href;
    },
    detect() {
      const id = tracker.currentVideoId();
      return id ? youtubeSource(id, tracker.title()) : detectSource(doc.location.href, doc);
    },
    // On a watch page `live` supplies the text; elsewhere on YouTube nothing is scanned, and a selection is explained like on any page.
    root: () => undefined,
    live: {
      active: () => tracker.active(),
      page: () => tracker.page(),
      watch: (onSettled, onReset) => tracker.watch(onSettled, onReset),
      context: (selection) => tracker.context(selection),
      text: () => tracker.text(),
    },
  };
}
