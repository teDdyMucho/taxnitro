"""Turn a client workbook into the two TypeScript modules the app ships.

The workbook is the source of truth. Nothing here interprets the figures — it
copies out the values the workbook itself computed, keeping FS-R/FS-A row numbers
so every reference stays checkable against the spreadsheet.

Two modules, and the split is the point: one holds what the client may see, the
other holds FTG's own Findings for Review and TL;DR. The notes module is fetched
only for staff, so its text never reaches the client's browser — hiding the tab
alone left every word of it in the JavaScript they downloaded.

This is the one implementation. scripts/xlsx2ts.py is a command line over it, and
the converter service calls it too, so the app and the automation cannot drift
into producing different files from the same workbook.
"""
import datetime
import json
import re
from decimal import ROUND_HALF_UP, Decimal

import openpyxl

# 2025 Jan-Dec = F..Q, FY total R; 2026 Jan-Dec = T..AE, FY total AF.
C25, T25, C26, T26 = 6, 18, 20, 32

# Rows above this are the workbook's title band — the client's name, the month
# headings, the Actual/Forecast row. Chrome the dashboard draws itself.
FIRST_ROW = 7


def clean(v):
    """A cell as the TypeScript module should hold it."""
    if v is None:
        return None
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%b %Y')
    if isinstance(v, str):
        return v.strip() or None
    if isinstance(v, bool):
        return v
    if isinstance(v, float):
        # Spreadsheet floats carry binary noise; the workbook displays cents.
        r = round(v, 6)
        return int(r) if r == int(r) else r
    return v


def present(wb, tab):
    """Whether the workbook still shows this tab.

    A hidden tab is one the workbook has withdrawn. Paul hid Findings for Review
    in two clients' v3 — "wala nang findings for review" — and carrying it across
    anyway would leave this app the one place it still shows.
    """
    return tab in wb.sheetnames and wb[tab].sheet_state == 'visible'


def _squash(x):
    return re.sub(r'[^a-z0-9]', '', x.lower())


def _client_name(wb):
    """The client's name, as their own FS-R states it."""
    ws = wb['FS-R']
    for r in range(1, 6):
        v = ws.cell(r, 2).value or ws.cell(r, 1).value
        if v and str(v).strip():
            return str(v).strip()
    return ''


def _client_key(name):
    """The leading words of a client's name, to match a heading against.

    The two are not written the same: FS-R calls them "Uniquely Enough
    Behavioral Health LLC" and their roadmap says "UNIQUELY ENOUGH". The front
    of the name is what holds steady, so that is what is compared.
    """
    words = [w for w in re.sub(r'[^A-Za-z0-9 ]', ' ', name).split()
             if w.lower() not in ('llc', 'inc', 'ltd', 'co')]
    return _squash(''.join(words[:2]))


def roadmap_tab(wb):
    """The roadmap that belongs to this client, and a warning if none does.

    Picking it by the tab's name is not safe. Battle Protection's v7 carries
    two: "Financial Roadmap", which is Access Granted Education's copied across
    cell for cell, and "Financial Roadmap-BPA", which is theirs. Going by the
    name would have put another client's plan on their dashboard.

    So the heading inside is read, and it has to name them. Where none does the
    roadmap is left out and said so — a client seeing no roadmap is a thing to
    fix, a client seeing another client's is not.
    """
    key = _client_key(_client_name(wb))
    found = []
    for ws in wb.worksheets:
        if ws.sheet_state != 'visible':
            continue
        if not ws.title.lower().startswith('financial roadmap'):
            continue
        head = next((str(c.value).strip() for row in ws.iter_rows(max_row=3)
                     for c in row if c.value), '')
        if key and key in _squash(head):
            return ws.title, None
        found.append(f'{ws.title} — {head[:70]}')
    if not found:
        return None, None
    return None, ('left the Financial Roadmap out: no tab heading names this client. '
                  'Found ' + '; '.join(found))


def grid(wb, tab):
    """A presentation tab, trimmed of the blank rows and columns around it."""
    ws = wb[tab]
    rows = [[clean(c.value) for c in row] for row in ws.iter_rows()]
    while rows and not any(x is not None for x in rows[-1]):
        rows.pop()
    width = max((max((i + 1 for i, x in enumerate(r) if x is not None), default=0)
                 for r in rows), default=0)
    return [r[:width] + [None] * (width - len(r)) for r in rows]


def statement(wb, tab):
    """FS-R / FS-A, keyed by the row number the workbook's formulas address."""
    ws = wb[tab]
    out = []
    for r in range(FIRST_ROW, ws.max_row + 1):
        label = next((clean(ws.cell(r, c).value) for c in range(1, 6)
                      if clean(ws.cell(r, c).value) is not None), None)
        y25 = [clean(ws.cell(r, C25 + i).value) for i in range(12)]
        y26 = [clean(ws.cell(r, C26 + i).value) for i in range(12)]
        t25, t26 = clean(ws.cell(r, T25).value), clean(ws.cell(r, T26).value)
        if label is None and not any(v is not None for v in y25 + y26 + [t25, t26]):
            continue
        out.append({'r': r, 'label': label if isinstance(label, str) else str(label or ''),
                    'y2025': y25, 't2025': t25, 'y2026': y26, 't2026': t26})
    return out


# ── The budget tab, kept as the workbook shows it ─────────────────────────────
#
# Paul added "FY2027 Budget" to every CFO workbook in November 2026. Its
# figures are of every kind on one sheet: dollars, rates, a month count, a
# break-even head count, an "OK" check. Stored as bare numbers, the app could
# only guess which is which — it does guess, on the grid tabs, by the label —
# so these are stored as the workbook displays them, in each cell's own number
# format, and the check further down reads every figure back off its text.
#
# Clients see it, notes for review and all. It went out to staff first because
# those notes list things to put right "before the budget is finalized"; asked
# whether clients could read them too, Paul (9 Nov 2026): "oo pre, initial
# budget naman kasi siya". Turned off, the budget goes back to the notes module,
# which only staff load.
BUDGET_FOR_CLIENTS = True

_BUDGET_TAB = re.compile(r'^FY\s?(\d{4}) Budget$', re.I)


def budget_tab(wb):
    """The latest year's budget tab on show, or None."""
    found = []
    for ws in wb.worksheets:
        m = _BUDGET_TAB.match(ws.title.strip())
        if m and ws.sheet_state == 'visible':
            found.append((int(m.group(1)), ws.title))
    return max(found)[1] if found else None


_COLOUR = re.compile(r'\[(?:black|blue|cyan|green|magenta|red|white|yellow|colou?r\s*\d+)\]', re.I)
_CURRENCY = re.compile(r'\[\$([^\]-]*)(?:-[0-9A-Fa-f]+)?\]')     # [$$-409] is "$"


def _sections(fmt):
    """A number format split at its unquoted semicolons."""
    out, cur, quoted, i = [], '', False, 0
    while i < len(fmt):
        ch = fmt[i]
        if ch == '\\' and not quoted and i + 1 < len(fmt):
            cur += fmt[i:i + 2]
            i += 2
            continue
        if ch == '"':
            quoted = not quoted
        if ch == ';' and not quoted:
            out.append(cur)
            cur = ''
        else:
            cur += ch
        i += 1
    out.append(cur)
    return out


def _section_text(section, value):
    """One section of a number format, applied to a value it does not sign."""
    section = _CURRENCY.sub(lambda m: '"' + m.group(1).replace('"', '') + '"',
                            _COLOUR.sub('', section))
    toks, scale, i = [], False, 0          # toks: (is a digit placeholder, text)
    while i < len(section):
        ch = section[i]
        if ch == '"':
            end = section.find('"', i + 1)
            end = len(section) if end < 0 else end
            toks.append((False, section[i + 1:end]))
            i = end + 1
        elif ch == '\\' and i + 1 < len(section):
            toks.append((False, section[i + 1]))
            i += 2
        elif ch in '_*' and i + 1 < len(section):
            # _x leaves the width of x; *x repeats x across the cell. Spacing only.
            toks.append((False, ' ' if ch == '_' else ''))
            i += 2
        elif ch in '0#?.,':
            toks.append((True, ch))
            i += 1
        else:
            scale = scale or ch == '%'
            toks.append((False, ch))
            i += 1
    places = [k for k, (p, _) in enumerate(toks) if p]
    if not places:
        return ''.join(t for _, t in toks).strip()    # a section of words only: "OK", "-"
    lo, hi = places[0], places[-1]
    pattern = ''.join(t for p, t in toks[lo:hi + 1] if p)
    whole, _, frac = pattern.partition('.')
    decimals = sum(ch in '0#?' for ch in frac)
    grouped = ',' in whole.rstrip(',')
    if scale:
        value *= 100
    # Excel rounds a displayed half away from zero; float rounding would not.
    q = Decimal(repr(float(value))).quantize(Decimal(1).scaleb(-decimals),
                                             rounding=ROUND_HALF_UP)
    figure = format(q, (',' if grouped else '') + f'.{decimals}f')
    return (''.join(t for _, t in toks[:lo]) + figure
            + ''.join(t for _, t in toks[hi + 1:])).strip()


def excel_text(value, fmt):
    """A number as Excel shows it under a cell's number format."""
    if not fmt or fmt.lower() == 'general' or re.search(r'\[[<>=]', fmt):
        # General, or a conditional format this does not read: plain digits.
        r = round(float(value), 10)
        return str(int(r)) if r == int(r) else format(Decimal(repr(r)).normalize(), 'f')
    secs = _sections(fmt)
    if value < 0 and len(secs) > 1:
        return _section_text(secs[1], -value)     # that section writes its own sign
    if value == 0 and len(secs) > 2:
        return _section_text(secs[2], 0)
    text = _section_text(secs[0], abs(value))
    return '-' + text if value < 0 else text


def display(cell):
    """A cell as the workbook shows it: words as written, a figure in its format."""
    v = cell.value
    if v is None:
        return None
    if isinstance(v, str):
        return v.strip() or None
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%b %Y')
    if isinstance(v, (int, float)):
        return excel_text(v, cell.number_format)
    return str(v)


def budget(wb, tab):
    """The budget tab as displayed, from A1, and which rows the workbook bolds."""
    ws = wb[tab]
    rows = [[display(c) for c in row] for row in ws.iter_rows()]
    while rows and not any(x is not None for x in rows[-1]):
        rows.pop()
    width = max((max((i + 1 for i, x in enumerate(r) if x is not None), default=0)
                 for r in rows), default=0)
    grid = [r[:width] + [None] * (width - len(r)) for r in rows]
    bold = []
    for ri, row in enumerate(ws.iter_rows(max_row=len(grid))):
        label = next((c for c in row if display(c) is not None), None)
        if label is not None and label.font is not None and label.font.b:
            bold.append(ri)
    return {'title': tab, 'bold': bold, 'grid': grid}


def _reads_back(text, value):
    """Whether a figure's text, read the way a person reads it, is the figure.

    The formatter agreeing with itself would prove nothing, so the text is read
    back on its own terms: a minus or parentheses for the sign, a percentage
    scaled back, and agreement to within half of the last decimal shown.
    """
    digits = re.sub(r'[^0-9.]', '', text)
    if not re.search(r'\d', digits):
        return True                      # words only: "OK", or "-" for nil
    shown = float(digits)
    if text.lstrip().startswith(('-', '(')):
        shown = -shown
    want = value * 100 if '%' in text else value
    places = len(digits.partition('.')[2])
    return abs(shown - want) <= 0.5 * 10 ** -places + 1e-9


def _j(v):
    return json.dumps(v, ensure_ascii=False)


def _fmt_grid(rows):
    return '[\n' + '\n'.join('  ' + _j(r) + ',' for r in rows) + '\n]'


def _fmt_budget(b):
    grid = _fmt_grid(b['grid']).replace('\n', '\n  ')
    return (f'{{\n  title: {_j(b["title"])},\n  bold: {_j(b["bold"])},\n'
            f'  grid: {grid},\n}}')


def _fmt_stmt(rows):
    return '[\n' + '\n'.join(
        f"  {{ r: {x['r']}, label: {_j(x['label'])},\n"
        f"    y2025: {_j(x['y2025'])}, t2025: {_j(x['t2025'])},\n"
        f"    y2026: {_j(x['y2026'])}, t2026: {_j(x['t2026'])} }},"
        for x in rows) + '\n]'


def _module(header, export, type_name, parts):
    body = f'\nexport const {export}: {type_name} = {{\n' + '\n'.join(
        f"  {k}: {v.replace(chr(10), chr(10) + '  ')}," for k, v in parts
    ) + f'\n}};\n\nexport default {export};\n'
    return header + body


def build_modules(path, export, name, bs, pl):
    """The two modules, as text, plus a note of which tabs were used.

    Returns (sheets_ts, notes_ts, report).
    """
    wb = openpyxl.load_workbook(path, data_only=True)

    sheet_parts = [
        ('ASSUMPTIONS', _fmt_grid(grid(wb, 'ASSUMPTIONS'))),
        ("'Balance Sheet'", _fmt_grid(grid(wb, bs))),
        ("'Profit and Loss'", _fmt_grid(grid(wb, pl))),
        ("'FS-R'", _fmt_stmt(statement(wb, 'FS-R'))),
        ("'FS-A'", _fmt_stmt(statement(wb, 'FS-A'))),
    ]
    report = {'roadmap': False, 'findings': False, 'tldr': False, 'budget': False}

    # Only where the workbook has one, and only while it is on show.
    roadmap, roadmap_warning = roadmap_tab(wb)
    if roadmap:
        sheet_parts.insert(1, ("'Financial Roadmap'", _fmt_grid(grid(wb, roadmap))))
        report['roadmap'] = True
    if roadmap_warning:
        report['roadmapWarning'] = roadmap_warning

    # With the statements, for clients to see; or with the notes, for staff
    # only (BUDGET_FOR_CLIENTS above).
    budget_part = None
    budget_name = budget_tab(wb)
    if budget_name:
        budget_part = ('Budget', _fmt_budget(budget(wb, budget_name)))
        report['budget'] = budget_name + ('' if BUDGET_FOR_CLIENTS else ' (staff only)')
        if BUDGET_FOR_CLIENTS:
            sheet_parts.append(budget_part)

    head = (
        "import type { ClientSheets } from './clientSheets';\n\n"
        f'// {name} — every tab of their workbook, values as the workbook itself\n'
        '// computed them. Generated from the source xlsx; edit the workbook and\n'
        '// regenerate rather than editing figures here.\n'
        '//\n'
        '// FS-R and FS-A keep their ORIGINAL row numbers. The workbook\'s formulas\n'
        '// address rows, and each client numbers them differently, so the row map\n'
        '// lives with the client\'s entry in clientDashboards.ts.\n'
    )
    sheets_ts = _module(head, export, 'ClientSheets', sheet_parts)

    notes_parts = []
    for tab, key in (('Findings for Review', 'findings'), ('TL;DR', 'tldr')):
        if present(wb, tab):
            notes_parts.append((f"'{tab}'", _fmt_grid(grid(wb, tab))))
            report[key] = True
    if budget_part and not BUDGET_FOR_CLIENTS:
        notes_parts.append(budget_part)

    notes_head = (
        "import type { ClientNotes } from './clientSheets';\n\n"
        f"// {name} — FTG's working notes.\n"
        '//\n'
        '// Kept apart from the statements deliberately. These are drafts about the\n'
        "// client's own bookkeeping, and this module is imported only when a staff\n"
        '// member is viewing, so none of it reaches the client at all.\n'
    )
    notes_ts = _module(notes_head, export.replace('_SHEETS', '_NOTES'),
                       'ClientNotes', notes_parts)

    return sheets_ts, notes_ts, report


# ── Checking what was generated against the workbook it came from ─────────────

def _norm(v):
    if v is None:
        return None
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%b %Y')
    if isinstance(v, str):
        return v.strip() or None
    if isinstance(v, float):
        r = round(v, 6)
        return int(r) if r == int(r) else r
    return v


def _same(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return abs(a - b) < 5e-7
    return a == b


# A quoted run in the generated module: a double-quoted value, or a
# single-quoted key. Matched so the rewriting below can step over them.
_QUOTED = re.compile(r'"(?:[^"\\]|\\.)*"' r"|'(?:[^'\\]|\\.)*'")


def _values(ts):
    """The data out of a generated module, without running JavaScript.

    The text is JSON but for its unquoted keys and trailing commas, so those two
    are rewritten — but only outside the quoted runs. A client's own words can
    look exactly like the things being rewritten: 2G3B name their roadmap
    "2G3B EATS, LLC: FP&A AND CONTROLLER FINANCIAL ROADMAP", and a rewrite that
    did not step over strings read ", LLC:" as a key and mangled the line.
    """
    body = ts[ts.index('= {'):]
    body = body[body.index('{'):body.rindex('}') + 1]

    def unwrapped(code):
        code = re.sub(r'(\{|,)(\s*)([A-Za-z_]\w*)\s*:', r'\1\2"\3":', code)
        return re.sub(r',(\s*[}\]])', r'\1', code)

    out, at = [], 0
    for m in _QUOTED.finditer(body):
        out.append(unwrapped(body[at:m.start()]))
        run = m.group(0)
        # A single-quoted key becomes the JSON string it stands for.
        out.append(json.dumps(run[1:-1].replace("\\'", "'"))
                   if run.startswith("'") else run)
        at = m.end()
    out.append(unwrapped(body[at:]))
    return json.loads(''.join(out))


def verify_against_workbook(path, sheets_ts, notes_ts, bs, pl):
    """Every figure in the generated modules, checked back against the workbook.

    Run before anything is published. A client's figures reaching the app
    unchecked is the failure worth ruling out, and it is cheap to rule out.
    """
    wb = openpyxl.load_workbook(path, data_only=True)
    data = _values(sheets_ts) | _values(notes_ts)

    checked = mismatches = 0
    problems = []

    for tab in ('FS-R', 'FS-A'):
        ws = wb[tab]
        for row in data[tab]:
            r = row['r']
            for field, col in (('y2025', C25), ('y2026', C26)):
                for i in range(12):
                    want, got = _norm(ws.cell(r, col + i).value), row[field][i]
                    checked += 1
                    if not _same(want, got):
                        mismatches += 1
                        problems.append(f'{tab} r{r} {field}[{i}]: {want!r} vs {got!r}')
            for field, col in (('t2025', T25), ('t2026', T26)):
                want, got = _norm(ws.cell(r, col).value), row[field]
                checked += 1
                if not _same(want, got):
                    mismatches += 1
                    problems.append(f'{tab} r{r} {field}: {want!r} vs {got!r}')

    tabs = [('Findings for Review', 'Findings for Review'), ('TL;DR', 'TL;DR'),
            ('ASSUMPTIONS', 'ASSUMPTIONS'),
            ('Financial Roadmap', roadmap_tab(wb)[0] or 'Financial Roadmap'),
            ('Balance Sheet', bs), ('Profit and Loss', pl)]
    for key, tab in [(k, t) for k, t in tabs if k in data]:
        ws = wb[tab]
        for ri, row in enumerate(data[key], start=1):
            for ci, got in enumerate(row, start=1):
                want = _norm(ws.cell(ri, ci).value)
                checked += 1
                if not _same(want, got):
                    mismatches += 1
                    problems.append(f'{key} [{ri},{ci}]: {want!r} vs {got!r}')

    # The budget holds text, so each cell is checked twice: that it is what the
    # workbook displays there, and that the figure read back off it is the value.
    if 'Budget' in data:
        ws = wb[data['Budget']['title']]
        for ri, row in enumerate(data['Budget']['grid'], start=1):
            for ci, got in enumerate(row, start=1):
                cell = ws.cell(ri, ci)
                ok = display(cell) == got
                if ok and isinstance(cell.value, (int, float)) and not isinstance(cell.value, bool):
                    ok = _reads_back(got, cell.value)
                checked += 1
                if not ok:
                    mismatches += 1
                    problems.append(f'Budget [{ri},{ci}]: {cell.value!r} shown as {got!r}')

    return {'figures': checked, 'mismatches': mismatches, 'problems': problems[:20]}
