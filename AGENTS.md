# Repository Guidelines

## Project Structure

This workspace contains teaching materials for a fictional maintenance request tracker. Both source files are at the workspace root.

- `報修需求筆記.txt` records the demo scope, form fields, access rules, and open decisions. Check it before changing the sample data or drafting a deliverable.
- `報修範例資料.xlsx` contains the sample records in the `範例資料` worksheet. Use it to check field labels and example values.
- The notes describe a proposal deck, an operating guide, a web form and list, and a Supabase setup as planned deliverables.

## Editing and Naming

Keep existing filenames and Traditional Chinese field labels. Save the requirements notes as UTF-8 plain text. If you change a field or an allowed value, update both the notes and the worksheet so contributors can use them together. Use fictional names and locations in every example.

## Build and Validation

Review the notes in a text editor and open the workbook in a spreadsheet app. This workspace has no build scripts, automated test suite, or coverage target. For workbook changes, confirm that the workbook opens, the headings match the notes, and sample categories, urgency levels, and statuses use the documented values.

For any future web implementation, verify that submission creates a record with a system-generated timestamp and that the record appears in the list. Enable Supabase row-level security and verify that the public client can insert and read records and that update and delete requests are denied. Keep privileged credentials out of frontend code and teaching materials.

## Change Reviews

This folder has no Git history to establish a commit convention. If changes are submitted through Git, use a short, action-oriented subject such as `Align sample urgency values with requirements`. In a pull request, summarize the changed materials, record the checks you ran, and link the related issue if one exists. Include screenshots when a visible layout changes.
