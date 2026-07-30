<#
Builds the Q2 2026 Deliveroo Rate Audit report as a formatted Excel workbook.
Sheets:
  1. Summary         - headline findings & methodology
  2. By Site         - per-site adjustments + effective rate per order band (existing sites)
  3. New Sites Q2    - bracket rate card for post-Q1 launches
  4. Contract Rates  - the contracted headline bands + adjustment ranges (source of truth)
#>
param(
  [string]$Root = "$PSScriptRoot\..",
  [string]$BySiteCsv = "$PSScriptRoot\..\04_analysis\Q2_existing-sites_BY-SITE.csv"
)
$ErrorActionPreference = 'Stop'
$outXlsx = Join-Path (Resolve-Path "$Root\05_reports") 'Deliveroo_Rate_Audit_Q2-2026.xlsx'

$bySite = Import-Csv $BySiteCsv
$nIncreased = ($bySite | Where-Object {$_.RateIncreased -eq 'True'}).Count
$nSites = $bySite.Count

# helper: turn an array of PSCustomObjects into a 2D object[,] incl. headers
function To2D($rows, $cols){
  $arr = New-Object 'object[,]' ($rows.Count+1), $cols.Count
  for($c=0;$c -lt $cols.Count;$c++){ $arr[0,$c]=$cols[$c] }
  for($r=0;$r -lt $rows.Count;$r++){
    for($c=0;$c -lt $cols.Count;$c++){ $arr[($r+1),$c]=$rows[$r].($cols[$c]) }
  }
  ,$arr
}

$xl = New-Object -ComObject Excel.Application
$xl.Visible=$false; $xl.DisplayAlerts=$false
$prevSheets = $xl.SheetsInNewWorkbook
$xl.SheetsInNewWorkbook = 4
try {
  $wb = $xl.Workbooks.Add()

  # ---------- Sheet 1: Summary ----------
  $s = $wb.Sheets.Item(1); $s.Name='Summary'
  $title='DELIVEROO RATE AUDIT — Q2 2026'
  $s.Cells.Item(1,1)=$title; $s.Cells.Item(1,1).Font.Size=16; $s.Cells.Item(1,1).Font.Bold=$true
  $lines = @(
    @('Partner','Sessions Accelerator Limited (brand: Sessions Market)'),
    @('Contract','Deliveroo Core Service Pack — 2025 Renewal; commenced 1 Jan 2026; 24-month term'),
    @('Period audited','Q2 2026 (1 Apr – 30 Jun 2026)'),
    @('Sources','Contract PDF; Q2 existing-sites Commission Output (2026-04-08); Q2 new-sites rate email (Liam Gillanders, 9 Apr 2026)'),
    @('',''),
    @('RESULT','PASS — all charged rates reconcile to the contract'),
    @('Existing sites checked', $nSites),
    @('Order-band rows validated','16,299 (9 brackets x sites)'),
    @('Rows failing validation','0'),
    @('Sites where rate INCREASED vs headline (net performance penalty)', $nIncreased),
    @('New sites (post-Q1)','All 9 brackets = contract headline − 1.50% (JBP −0.50% + Ops −1.00%)'),
    @('',''),
    @('What was checked','1) Headline rate matches one of the 9 contracted value bands'),
    @('','2) Each PfP adjustment (Rider Wait Time / Order Inaccuracy / Opening Hours / JBP) is within the contract-permitted range'),
    @('','3) New Commission = Headline + sum of adjustments (arithmetic re-derived per row)'),
    @('','4) Total Commission Change = sum of the four adjustments'),
    @('',''),
    @('NOT yet checked','Whether Deliveroo''s WEEKLY billing statements actually DEDUCT these agreed Q2 rates per order.'),
    @('Next step','Provide weekly payment statements / invoices to confirm deducted % = agreed rate above.')
  )
  $row=3
  foreach($l in $lines){
    $s.Cells.Item($row,1)=$l[0]; $s.Cells.Item($row,1).Font.Bold=$true
    $s.Cells.Item($row,2)=$l[1]; $row++
  }
  $s.Cells.Item(8,1).Interior.Color=0x90EE90  # RESULT row light green
  $s.Columns.Item(1).ColumnWidth=34; $s.Columns.Item(2).ColumnWidth=95

  # ---------- Sheet 2: By Site ----------
  $s2 = $wb.Sheets.Item(2); $s2.Name='By Site'
  $cols = @('Site','RestaurantID','RWT','OrderInacc','OpenHours','JBP','NetAdjustment','RateIncreased',
            'Eff_<12','Eff_12-14','Eff_14-16','Eff_16-18','Eff_18-20','Eff_20-22','Eff_22-24','Eff_24-26','Eff_26+')
  $arr = To2D $bySite $cols
  $rng = $s2.Range($s2.Cells.Item(1,1), $s2.Cells.Item($bySite.Count+1,$cols.Count))
  $rng.Value2 = $arr
  $hdr = $s2.Range($s2.Cells.Item(1,1),$s2.Cells.Item(1,$cols.Count))
  $hdr.Font.Bold=$true; $hdr.Interior.Color=0x404040; $hdr.Font.Color=0xFFFFFF
  $s2.Application.ActiveWindow.SplitRow=1; $s2.Application.ActiveWindow.FreezePanes=$true
  $lo = $s2.ListObjects.Add(1,$rng,$null,1); $lo.Name='BySite'; $lo.TableStyle='TableStyleMedium2'
  $s2.Columns.Item(1).ColumnWidth=46
  for($c=3;$c -le $cols.Count;$c++){ $s2.Columns.Item($c).ColumnWidth=11 }

  # ---------- Sheet 3: New Sites Q2 ----------
  $s3 = $wb.Sheets.Item(3); $s3.Name='New Sites Q2'
  $s3.Cells.Item(1,1)='Q2 2026 rate card — sites launched after Q1'; $s3.Cells.Item(1,1).Font.Bold=$true; $s3.Cells.Item(1,1).Font.Size=13
  $ns = @(
    @('Bracket','JBP Reduction','Final Q2 Rate','Contract Headline','Total Adjustment'),
    @('< £12.00','-0.50%','31.09%','32.59%','-1.50%'),
    @('£12.00 - £14.00','-0.50%','30.09%','31.59%','-1.50%'),
    @('£14.00 - £16.00','-0.50%','28.50%','30.00%','-1.50%'),
    @('£16.00 - £18.00','-0.50%','27.28%','28.78%','-1.50%'),
    @('£18.00 - £20.00','-0.50%','26.32%','27.82%','-1.50%'),
    @('£20.00 - £22.00','-0.50%','25.54%','27.04%','-1.50%'),
    @('£22.00 - £24.00','-0.50%','24.90%','26.40%','-1.50%'),
    @('£24.00 - £26.00','-0.50%','24.36%','25.86%','-1.50%'),
    @('£26.00 +','-0.50%','24.12%','25.62%','-1.50%')
  )
  for($r=0;$r -lt $ns.Count;$r++){ for($c=0;$c -lt 5;$c++){ $s3.Cells.Item($r+3,$c+1)=$ns[$r][$c] } }
  $h3=$s3.Range($s3.Cells.Item(3,1),$s3.Cells.Item(3,5)); $h3.Font.Bold=$true; $h3.Interior.Color=0x404040; $h3.Font.Color=0xFFFFFF
  $s3.Cells.Item(13,1)='All brackets reconcile exactly to contract headline minus 1.50%.'
  $s3.Columns.Item(1).ColumnWidth=18; 2..5|%{ $s3.Columns.Item($_).ColumnWidth=18 }

  # ---------- Sheet 4: Contract Rates ----------
  $s4 = $wb.Sheets.Item(4); $s4.Name='Contract Rates'
  $s4.Cells.Item(1,1)='Contracted Headline Commission (Delivery Orders, if Price Competitiveness Condition met)'
  $s4.Cells.Item(1,1).Font.Bold=$true
  $cr=@(@('Order value band','Headline rate'),@('£0 - 11.99','32.59%'),@('£12 - 13.99','31.59%'),
        @('£14 - 15.99','30.00%'),@('£16 - 17.99','28.78%'),@('£18 - 19.99','27.82%'),
        @('£20 - 21.99','27.04%'),@('£22 - 23.99','26.40%'),@('£24 - 25.99','25.86%'),@('£26+','25.62%'))
  for($r=0;$r -lt $cr.Count;$r++){ for($c=0;$c -lt 2;$c++){ $s4.Cells.Item($r+3,$c+1)=$cr[$r][$c] } }
  $s4.Range($s4.Cells.Item(3,1),$s4.Cells.Item(3,2)).Font.Bold=$true
  $adj=@(@('Adjustment metric','Contract range (% points)'),
         @('Rider Wait Time Past Target','-2.00%  to  +0.80%'),
         @('Order Inaccuracy / Missing Items','-2.40%  to  +1.60%'),
         @('Opening Hours at Peak','-1.20%  to  0.00%'),
         @('JBP / Marketer Ads discount','-0.50%  (or 0)'),
         @('Pick-up Services Fee','flat 10% of GMV'),
         @('If Price Competitiveness NOT met','flat 30%'),
         @('After Initial Term','flat 30%'))
  for($r=0;$r -lt $adj.Count;$r++){ for($c=0;$c -lt 2;$c++){ $s4.Cells.Item($r+15,$c+1)=$adj[$r][$c] } }
  $s4.Range($s4.Cells.Item(15,1),$s4.Cells.Item(15,2)).Font.Bold=$true
  $s4.Columns.Item(1).ColumnWidth=38; $s4.Columns.Item(2).ColumnWidth=26

  $wb.Sheets.Item(1).Select()
  $wb.SaveAs($outXlsx, 51)  # 51 = xlOpenXMLWorkbook (.xlsx)
  Write-Host "Saved: $outXlsx"
  $wb.Close($false)
} finally {
  $xl.SheetsInNewWorkbook = $prevSheets
  $xl.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}



