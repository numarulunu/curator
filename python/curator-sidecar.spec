# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

scipy_datas, scipy_binaries, scipy_hiddenimports = collect_all("scipy")

a = Analysis(
    ["curator/__main__.py"],
    pathex=["."],
    binaries=scipy_binaries,
    datas=scipy_datas,
    hiddenimports=["curator.builtins"] + scipy_hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=None)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="curator-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
