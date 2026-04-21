import curator.builtins  # noqa: F401  (register decorators run on import)
from curator.rpc import serve_stdio


def main() -> None:
    serve_stdio()


if __name__ == "__main__":
    main()
