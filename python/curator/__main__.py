import sys

# Force UTF-8 on stdio BEFORE any other import runs. PyInstaller-bundled Python
# on Windows does not reliably honor PYTHONIOENCODING from the parent env, so
# stdin/stdout default to cp1252 and any non-ASCII path from Electron JSON-RPC
# arrives as mojibake. This reconfigure runs inside the Python process and is
# independent of how the bootloader was configured.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

import curator.builtins  # noqa: E402, F401  (register decorators run on import)
from curator.rpc import serve_stdio  # noqa: E402


def main() -> None:
    serve_stdio()


if __name__ == "__main__":
    main()
