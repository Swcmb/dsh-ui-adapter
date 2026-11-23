import ctypes
from ctypes import wintypes

user32 = ctypes.WinDLL('user32', use_last_error=True)

EnumWindows = user32.EnumWindows
EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)

GetWindowThreadProcessId = user32.GetWindowThreadProcessId
GetWindowTextW = user32.GetWindowTextW
GetWindowTextLengthW = user32.GetWindowTextLengthW
GetWindowRect = user32.GetWindowRect
IsWindowVisible = user32.IsWindowVisible

class RECT(ctypes.Structure):
    _fields_ = [('left', ctypes.c_long), ('top', ctypes.c_long),
                ('right', ctypes.c_long), ('bottom', ctypes.c_long)]

rows = []

def cb(hwnd, lparam):
    pid = wintypes.DWORD()
    GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    n = GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(n + 2)
    GetWindowTextW(hwnd, buf, n + 2)
    title = buf.value
    if 'DeepSeek' not in title:
        return True
    r = RECT()
    GetWindowRect(hwnd, ctypes.byref(r))
    rows.append({
        'hwnd': int(hwnd),
        'pid': int(pid.value),
        'title': title,
        'visible': bool(IsWindowVisible(hwnd)),
        'x': r.left, 'y': r.top,
        'w': r.right - r.left, 'h': r.bottom - r.top,
    })
    return True

EnumWindows(EnumWindowsProc(cb), 0)
for r in sorted(rows, key=lambda x: (-x['w'] * x['h'])):
    print(f"pid={r['pid']:<7} hwnd={r['hwnd']:<10} visible={str(r['visible']):<5} "
          f"rect=({r['x']},{r['y']}) {r['w']}x{r['h']}  title={r['title']!r}")
print('total', len(rows))
