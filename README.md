# 數遊系印務需求系統

> **線上系統入口：[直接開啟數遊系印務需求系統](https://script.google.com/macros/s/AKfycbwnLPZAdrguZIzWd0d9cpm7euQNNn-AGttMAVELanAmHl5VN6atnF-ud06w1RSK5HWw0Q/exec)**

以 Google Apps Script 提供表單與內部作業介面，Google 試算表保存需求資料，GitHub Pages 提供入口頁。本專案不使用 Cloud Run。

## 功能

- 免登入提出印務需求，可填聯絡信箱、需求說明、期限與自選地點。
- 提供印務／設計完稿上傳區、案件檢視、進度與審核功能。
- GitHub Pages 首頁連到目前 Apps Script 網頁應用程式。

## 目前部署

- Apps Script 以專案擁有者身分執行，存取範圍設為「任何人」。
- 入口網址：[開啟印務需求系統](https://script.google.com/macros/s/AKfycbwnLPZAdrguZIzWd0d9cpm7euQNNn-AGttMAVELanAmHl5VN6atnF-ud06w1RSK5HWw0Q/exec)
- 修改 Apps Script 程式後，請建立新版本並更新現有部署；部署網址維持不變。

## 權限與資料注意事項

免登入提交時，填寫的姓名與電子郵件是使用者自行提供，不能證明其 Google 帳號身分。Apps Script 在「以擁有者執行、任何人可存取」時，Session.getActiveUser().getEmail() 可能是空白；因此需要登入身分的管理審核及印務／設計上傳權限，必須用實際授權帳號確認可用，不能只依賴表單填寫的信箱。

目前介面載入資料的程式會把需求資料提供給訪客。任何取得網頁網址的人都可能看到需求內容與聯絡資訊。請勿在表單填入敏感個資；若要保護需求資料，需先改成可靠的 Google 身分驗證與伺服器端權限檢查，再公開分享。

Google 試算表請保持私人，只授權必要管理者。雲端硬碟檔案的可見性仍由檔案本身的分享設定控制。公開 GitHub 儲存庫不可放入試算表 ID、OAuth 密鑰或私人需求資料。

## 專案檔案

- Code.gs：Apps Script 後端。
- Index.html：Apps Script 網頁介面（檔名大小寫需一致）。
- index.html：GitHub Pages 首頁入口。
- appsscript.json：Apps Script 專案設定。

若要重新建立資料表，請在 Apps Script 編輯器執行 initializeDatabase，並確認專案設定中的試算表 ID 與授權帳號正確。
