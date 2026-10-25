; Extra uninstaller steps (electron-builder includes this file automatically).
; Uninstalling asks whether to delete the app's data folder too: settings, favorites, and an offline library saved in
; the default place (often several gigabytes). No is the default, so nothing is deleted by accident. A library saved
; to a folder of the user's own choosing is never touched. Updates also run the uninstaller, and a silent uninstall
; has no one to ask, so neither asks or deletes anything.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    IfSilent e2k_done
    IfFileExists "$APPDATA\encyclopedia-2000\*.*" 0 e2k_done
    IfFileExists "$APPDATA\encyclopedia-2000\Library\*.zim" 0 e2k_no_library
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete your offline library?$\r$\n$\r$\nYour offline library and your Encyclopedia 2000 settings and favorites are still on this computer. Delete them too?" /SD IDNO IDYES e2k_delete
      Goto e2k_done
    e2k_no_library:
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete your settings and favorites?$\r$\n$\r$\nYour Encyclopedia 2000 settings and favorites are still on this computer. Delete them too?" /SD IDNO IDYES e2k_delete
      Goto e2k_done
    e2k_delete:
      RMDir /r "$APPDATA\encyclopedia-2000"
    e2k_done:
  ${endIf}
!macroend
