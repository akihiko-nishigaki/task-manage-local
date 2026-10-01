' タスク管理をコンソール画面を出さずに起動する。
' ショートカットはこのファイルを wscript.exe で実行する。
Option Explicit

Dim shell, fso, appDir, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Node.js が入っているか確認する
If shell.Run("cmd /c where node", 0, True) <> 0 Then
  MsgBox "Node.js が見つかりません。" & vbCrLf & vbCrLf & _
         "https://nodejs.org/ja から LTS 版をインストールしてから、" & vbCrLf & _
         "もう一度起動してください。", 48, "タスク管理"
  WScript.Quit 1
End If

cmd = "node.exe --no-warnings=ExperimentalWarning """ & appDir & "\launch.cjs"""
shell.CurrentDirectory = appDir
shell.Run cmd, 0, False
