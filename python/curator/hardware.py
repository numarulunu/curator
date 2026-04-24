from __future__ import annotations

import ctypes
import os
import sys
from dataclasses import asdict, dataclass
from typing import List


@dataclass(frozen=True)
class HardwareProfile:
    cpu_count: int
    memory_mb: int
    providers: List[str]
    directml_available: bool


def _providers() -> List[str]:
    try:
        import onnxruntime as ort
        return list(ort.get_available_providers())
    except Exception:
        return ["CPUExecutionProvider"]


def _memory_mb() -> int:
    if sys.platform == "win32":
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]
        stat = MEMORYSTATUSEX()
        stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
            return 4096
        return int(stat.ullTotalPhys // (1024 * 1024))
    try:
        return int(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") // (1024 * 1024))
    except Exception:
        return 4096  # reasonable fallback


def detect() -> HardwareProfile:
    provs = _providers()
    return HardwareProfile(
        cpu_count=os.cpu_count() or 1,
        memory_mb=_memory_mb(),
        providers=provs,
        directml_available="DmlExecutionProvider" in provs,
    )


def pick_provider(gpu_mode: str) -> str:
    provs = _providers()
    has_dml = "DmlExecutionProvider" in provs
    if gpu_mode in ("auto", "on") and has_dml:
        return "DmlExecutionProvider"
    return "CPUExecutionProvider"


def detect_as_dict() -> dict:
    return asdict(detect())
