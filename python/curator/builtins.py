import sys
from curator import __version__
from curator.rpc import register


@register("ping")
def ping(_params):
    return {"pong": True}


@register("version")
def version(_params):
    return {"sidecar": __version__, "python": sys.version.split()[0]}


from curator.paths import resolve_bin


@register("binaries")
def binaries(_params):
    return {
        "exiftool": resolve_bin("exiftool.exe"),
        "ffprobe":  resolve_bin("ffprobe.exe"),
        "ffmpeg":   resolve_bin("ffmpeg.exe"),
    }


from curator import scan as _scan


@register("scan")
def _scan_handler(params: dict) -> dict:
    return _scan.scan(params["root"], params.get("batch_size", 500))
