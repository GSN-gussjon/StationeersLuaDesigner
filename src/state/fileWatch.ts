// File auto-reload using the File System Access API.
//
// The browser cannot silently watch an arbitrary disk file; the user picks the
// file once (a FileSystemFileHandle), after which we poll its lastModified and
// re-read the contents when it changes. Supported in Chromium browsers
// (Chrome/Edge). Elsewhere isFileWatchSupported() is false.

/** Feature-detect the File System Access API's file picker. */
export function isFileWatchSupported(): boolean {
  return typeof (window as unknown as { showOpenFilePicker?: unknown })
    .showOpenFilePicker === "function";
}

// Minimal typings for the subset of the API we use (avoids depending on
// lib.dom versions that may not include these yet).
interface FileHandle {
  getFile: () => Promise<File>;
  name: string;
}
type ShowOpenFilePicker = (opts?: {
  types?: { description?: string; accept: Record<string, string[]> }[];
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
}) => Promise<FileHandle[]>;

/** Open a file picker and return the chosen handle, or null if cancelled. */
export async function pickScriptFile(): Promise<FileHandle | null> {
  const picker = (window as unknown as { showOpenFilePicker?: ShowOpenFilePicker })
    .showOpenFilePicker;
  if (!picker) {
    throw new Error("File System Access API not available in this browser.");
  }
  try {
    const [handle] = await picker({
      multiple: false,
      types: [
        {
          description: "Script files",
          accept: { "text/plain": [".ss", ".lua", ".txt", ".mips"] },
        },
      ],
      // Allow picking any file too, so an unusual extension can't block it.
      excludeAcceptAllOption: false,
    });
    return handle ?? null;
  } catch (e) {
    // AbortError = the user cancelled the dialog; that's not an error.
    if (e instanceof DOMException && e.name === "AbortError") return null;
    // Anything else (SecurityError, TypeError on accept map, etc.) is real:
    // rethrow so the caller can surface it instead of silently doing nothing.
    throw e;
  }
}

export interface FileWatcher {
  /** Display name of the watched file. */
  name: string;
  /** Stop polling. */
  stop: () => void;
}

/**
 * Poll a file handle for changes. Reads the file immediately once, then every
 * `intervalMs`; calls onChange with the new text whenever lastModified advances.
 * onError is called if a read fails (e.g. permission revoked or file removed).
 */
export function watchFile(
  handle: FileHandle,
  onChange: (text: string) => void,
  onError: (message: string) => void,
  intervalMs = 1000
): FileWatcher {
  let lastMod = -1;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const check = async () => {
    if (stopped) return;
    try {
      const file = await handle.getFile();
      if (file.lastModified !== lastMod) {
        lastMod = file.lastModified;
        const text = await file.text();
        if (!stopped) onChange(text);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  // Read once right away, then poll.
  void check();
  timer = setInterval(() => void check(), intervalMs);

  return {
    name: handle.name,
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
