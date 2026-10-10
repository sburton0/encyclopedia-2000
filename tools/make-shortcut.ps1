# Creates a Start menu shortcut for Encyclopedia 2000 that you can pin to the taskbar.
# Run with: npm run shortcut
# The shortcut carries the same app ID as main.js, so the pinned button and the running window share one taskbar spot.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$icon = Join-Path $root 'build\icon.ico'
$appId = 'com.svid.encyclopedia2000'
$lnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'Encyclopedia 2000.lnk'

if (-not (Test-Path $electron)) { throw "Electron isn't installed yet. Run 'npm run setup' first." }
if (-not (Test-Path $icon)) { throw "The app icon is missing. Run 'npm run icons' first." }

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

[ComImport, Guid("00021401-0000-0000-C000-000000000046")] class CShellLink {}

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
interface IShellLinkW {
  void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder f, int c, IntPtr fd, uint fl);
  void GetIDList(out IntPtr p);
  void SetIDList(IntPtr p);
  void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int c);
  void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string s);
  void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int c);
  void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string s);
  void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int c);
  void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string s);
  void GetHotkey(out short h);
  void SetHotkey(short h);
  void GetShowCmd(out int i);
  void SetShowCmd(int i);
  void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int c, out int i);
  void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string s, int i);
  void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string s, uint r);
  void Resolve(IntPtr h, uint f);
  void SetPath([MarshalAs(UnmanagedType.LPWStr)] string s);
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
public struct PROPERTYKEY { public Guid fmtid; public uint pid; }

[StructLayout(LayoutKind.Explicit)]
public struct PROPVARIANT { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
interface IPropertyStore {
  void GetCount(out uint c);
  void GetAt(uint i, out PROPERTYKEY k);
  void GetValue(ref PROPERTYKEY k, out PROPVARIANT v);
  void SetValue(ref PROPERTYKEY k, ref PROPVARIANT v);
  void Commit();
}

public static class E2KShortcut {
  public static void Create(string lnk, string target, string args, string dir, string icon, string desc, string appId) {
    var link = (IShellLinkW)new CShellLink();
    link.SetPath(target);
    link.SetArguments(args);
    link.SetWorkingDirectory(dir);
    link.SetIconLocation(icon, 0);
    link.SetDescription(desc);
    // PKEY_AppUserModel_ID
    var key = new PROPERTYKEY { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
    var value = new PROPVARIANT { vt = 31, p = Marshal.StringToCoTaskMemUni(appId) };
    var store = (IPropertyStore)link;
    store.SetValue(ref key, ref value);
    store.Commit();
    Marshal.FreeCoTaskMem(value.p);
    ((System.Runtime.InteropServices.ComTypes.IPersistFile)link).Save(lnk, true);
  }
}
"@

[E2KShortcut]::Create($lnk, $electron, "`"$root`"", $root, $icon, 'A nostalgic encyclopedia powered by Wikipedia', $appId)
Write-Host "Created $lnk"
Write-Host "To pin it: open Start, search for 'Encyclopedia 2000', right-click it, and choose 'Pin to taskbar'."
