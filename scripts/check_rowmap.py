"""Check the derived row maps against the six that were read by hand.

Those six are the only ground truth there is: each was read off its workbook and
its figures verified against it. A deriver that reproduces all six can be trusted
with a seventh.
"""
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from derive_rowmap import derive                     # noqa: E402

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

W = 'C:/Users/Ongoing/Desktop/ftg-workbooks'
FILES = {
    'UE_ROWS': 'ue-v3.xlsx', 'FIRST_STEP_ROWS': '1sg-v3.xlsx',
    'TWO_G_THREE_B_ROWS': '2g3b-v3.xlsx', 'ACCESS_GRANTED_ROWS': 'age-v3.xlsx',
    'BATTLE_PROTECTION_ROWS': 'bpa-v7.xlsx', 'STEER_ROWS': 'steer-v2.xlsx',
}


def known():
    """The hand-read maps, straight out of the registry."""
    src = io.open('src/lib/clientDashboards.ts', encoding='utf-8').read()
    src += io.open('src/lib/ueModel.ts', encoding='utf-8').read()
    out = {}
    for m in re.finditer(r'(?:const|export const) (\w+_ROWS): RowMap = \{(.*?)\n\};', src, re.S):
        body = re.sub(r'//[^\n]*', '', m.group(2))
        fields = {}
        for f in re.finditer(r'(\w+):\s*(\[[^\]]*\]|\d+)', body):
            raw = f.group(2)
            fields[f.group(1)] = (
                [int(x) for x in re.findall(r'\d+', raw)] if raw.startswith('[') else int(raw))
        out[m.group(1)] = fields
    return out


KEEP = ['income', 'totalIncome', 'headlineExpense', 'payroll', 'opexFirst', 'opexLast',
        'opexSkip', 'totalOpex', 'grossProfit', 'otherIncome', 'totalOtherIncome',
        'otherExpense', 'totalOtherExpense', 'netOther', 'netIncome',
        'cash', 'currentAssets', 'cards', 'currentLiabilities', 'draws', 'equity']

maps, bad = known(), 0
for name, f in FILES.items():
    want = maps.get(name)
    if not want:
        print(f'{name}: not found in the registry'); bad += 1; continue
    got = derive(os.path.join(W, f))
    diffs = [(k, want.get(k), got.get(k)) for k in KEEP if want.get(k) != got.get(k)]
    if diffs:
        bad += 1
        print(f'{name}  ({f})')
        for k, a, b in diffs:
            print(f'    {k:20} hand-read {str(a):24} derived {b}')
    else:
        print(f'{name}  ({f})  every field matches')

print(f'\n{bad} of {len(FILES)} disagree' if bad else
      f'\nAll {len(FILES)} maps reproduced exactly.')
