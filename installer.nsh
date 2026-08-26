; ── Stock Book 커스텀 NSIS 인클루드 ──────────────────────────────────
; 완료 페이지: "Windows 시작 시 자동 실행" 체크박스 추가
!define MUI_FINISHPAGE_SHOWREADME ""
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Windows 시작 시 자동 실행 (시작 프로그램 등록)"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION fn_SetAutoStart

Function fn_SetAutoStart
  ; 체크 시: 레지스트리에 자동 실행 등록
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "StockBook" \
    '"$INSTDIR\Stock Book.exe"'
FunctionEnd

; 설치 중 실행 (파일 복사 완료 후)
!macro customInstall
  ; 이전 버전의 자동 실행 키가 있으면 경로 갱신
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "StockBook"
  ${If} $0 != ""
    WriteRegStr HKCU \
      "Software\Microsoft\Windows\CurrentVersion\Run" \
      "StockBook" \
      '"$INSTDIR\Stock Book.exe"'
  ${EndIf}
!macroend

; 제거 시: 자동 실행 레지스트리 키 삭제
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "StockBook"
!macroend
