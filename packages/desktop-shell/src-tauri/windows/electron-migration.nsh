!define ELECTRON_INSTALL_KEY "Software\d6bd5575-5bf2-5dad-acfe-35e3bbeefd68"
!define ELECTRON_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\d6bd5575-5bf2-5dad-acfe-35e3bbeefd68"

!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $R0 HKCU "${ELECTRON_INSTALL_KEY}" "InstallLocation"
  ReadRegStr $R1 HKCU "${ELECTRON_UNINSTALL_KEY}" "DisplayName"
  ${If} $R0 != ""
  ${AndIf} $R1 == "OpenWork"
    ExecWait '"$R0\Uninstall OpenWork.exe" /currentuser /S --updated _?=$R0' $R2
    ${If} $R2 != 0
      Abort "Could not remove the previous OpenWork installation."
    ${EndIf}
  ${EndIf}
!macroend
