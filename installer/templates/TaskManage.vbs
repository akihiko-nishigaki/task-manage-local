' タスク管理をコンソール画面を出さずに起動する。
' ショートカットはこのファイルを wscript.exe で実行する。
Option Explicit

Dim shell, fso, appDir, cmd, errFile, pidFile, i, f, msg
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
errFile = appDir & "\last-error.txt"
pidFile = appDir & "\app.pid"

' Node.js が入っているか確認する
If shell.Run("cmd /c where node", 0, True) <> 0 Then
  MsgBox "Node.js が見つかりません。" & vbCrLf & vbCrLf & _
         "https://nodejs.org/ja から LTS 版をインストールしてから、" & vbCrLf & _
         "もう一度起動してください。", 48, "タスク管理"
  WScript.Quit 1
End If

' 前回の失敗メッセージは消しておく
If fso.FileExists(errFile) Then fso.DeleteFile errFile, True

cmd = "node.exe --no-warnings=ExperimentalWarning """ & appDir & "\launch.cjs"""
shell.CurrentDirectory = appDir
shell.Run cmd, 0, False

' 黒い画面を出さない代わりに、起動に失敗したときは理由を表示する
' （共有フォルダに繋がらない、データが新しいバージョンで更新されている、など）。
' 起動できたときは launch.cjs が app.pid を作るので、そこで待つのをやめる。最大 15 秒。
For i = 1 To 30
  WScript.Sleep 500
  If fso.FileExists(errFile) Then
    Set f = fso.OpenTextFile(errFile, 1, False, -1)
    msg = f.ReadAll
    f.Close
    MsgBox "タスク管理を起動できませんでした。" & vbCrLf & vbCrLf & msg, 48, "タスク管理"
    WScript.Quit 1
  End If
  If fso.FileExists(pidFile) Then Exit For
Next
