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
from openpyxl.utils import get_column_letter
from openpyxl.utils.cell import range_boundaries

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


# ── The month's overview, read the way the sheet reads ───────────────────────
#
# Paul put "Oct 2026 Overview" at the front of every CFO workbook in November
# 2026: what happened in the month, where the money went against the month
# before, a profit walk drawn as a waterfall, and what FTG recommends for the
# month ahead — on some, a month-by-month chart or a cash walk as well. One
# template, but the wording, the number of lines and the month are his to
# change, so it is read by its shape rather than by fixed cells: a heading in
# capitals, and under it numbered points, a table, or a chart.
#
# Clients see it. It is written to them ("what we recommend for November") and
# Paul put it first in the workbook, ahead of the Dashboard. Turned off, the
# overview goes to the notes module, which only staff load.
OVERVIEW_FOR_CLIENTS = True

_OVERVIEW_TAB = re.compile(r'^([A-Za-z]{3,9})\.?\s+(\d{4})\s+Overview$', re.I)
_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

# The green and red a number format can paint a figure: [Green] or [Color10]
# (Excel's palette green, which Paul's "effect on profit" uses), [Red].
_GOOD = re.compile(r'\[(?:green|colou?r\s*(?:4|10))\]', re.I)
_BAD = re.compile(r'\[(?:red|colou?r\s*(?:3|9))\]', re.I)


def overview_month(title):
    """(year, month 0–11) an overview tab is for, read off its name; or None."""
    m = _OVERVIEW_TAB.match(title.strip())
    if not m or m.group(1)[:3].lower() not in _MONTHS:
        return None
    return int(m.group(2)), _MONTHS.index(m.group(1)[:3].lower())


def overview_tab(wb):
    """The latest month's overview tab on show, or None."""
    found = [(overview_month(ws.title), ws.title) for ws in wb.worksheets
             if ws.sheet_state == 'visible' and overview_month(ws.title)]
    return max(found)[1] if found else None


def _merges(ws):
    """Each merged range's first cell, mapped to its last column; and every cell
    a merge covers besides that first one, which holds nothing of its own."""
    first, covered = {}, set()
    for rng in ws.merged_cells.ranges:
        first[(rng.min_row, rng.min_col)] = rng.max_col
        for r in range(rng.min_row, rng.max_row + 1):
            for c in range(rng.min_col, rng.max_col + 1):
                if (r, c) != (rng.min_row, rng.min_col):
                    covered.add((r, c))
    return first, covered


def _is_heading(cell):
    """A section heading: words in capitals, in bold."""
    v = cell.value
    return (isinstance(v, str) and bool(cell.font and cell.font.b)
            and sum(ch.isalpha() for ch in v) >= 3 and v == v.upper())


def _is_figure(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _tone(cell):
    """'up' or 'down' where the cell's own format paints its figure green or red."""
    v = cell.value
    if not _is_figure(v) or not cell.number_format:
        return None
    secs = _sections(cell.number_format)
    sec = secs[1] if v < 0 and len(secs) > 1 else secs[2] if v == 0 and len(secs) > 2 else secs[0]
    return 'up' if _GOOD.search(sec) else 'down' if _BAD.search(sec) else None


def _ref(f):
    """A chart's reference, 'Oct 2026 Overview'!$B$74:$B$82, as its bounds."""
    return range_boundaries(f.split('!')[-1].replace('$', ''))


def _ref_cells(ws, f):
    c1, r1, c2, r2 = _ref(f)
    return [ws.cell(r, c) for r in range(r1, r2 + 1) for c in range(c1, c2 + 1)]


def _series_f(x):
    """The formula a chart series takes its categories or values from."""
    for kind in ('numRef', 'strRef'):
        ref = getattr(x, kind, None) if x is not None else None
        if ref is not None and ref.f:
            return ref.f
    return None


def _series_name(ws, s):
    if s.tx is None:
        return None
    if s.tx.strRef is not None and s.tx.strRef.f:
        return display(_ref_cells(ws, s.tx.strRef.f)[0])
    return s.tx.v


def _overview_walk(ws, bars):
    """A profit walk, from the table its columns are drawn from.

    The chart is a stack of invisible bases under visible rises and falls. The
    table behind it says the same thing plainly — each step's change, the totals
    at either end, the label written over each bar — and that is what is kept:
    a total stands on zero, a step starts where the last one ended.
    """
    cat = _series_f(bars.series[0].cat) if bars.series else None
    if not cat:
        return None, 'the profit walk has no categories'
    c, r1, _, r2 = _ref(cat)
    cols = {}
    for cell in ws[r1 - 1]:
        if isinstance(cell.value, str):
            cols.setdefault(cell.value.strip().lower(), cell.column)
    if any(k not in cols for k in ('change', 'net income', 'label')):
        return None, 'the profit walk has no Change, Net income and Label columns'
    steps, at = [], None
    for r in range(r1, r2 + 1):
        change = ws.cell(r, cols['change']).value
        step = {'label': display(ws.cell(r, c)), 'kind': 'total', 'from': 0, 'to': 0,
                'text': display(ws.cell(r, cols['label']))}
        if _is_figure(change) and at is not None:
            step.update(kind='up' if change >= 0 else 'down',
                        **{'from': round(at, 2), 'to': round(at + change, 2)})
            at += change
        else:
            total = ws.cell(r, cols['net income']).value
            at = float(total) if _is_figure(total) else 0.0
            step['to'] = round(at, 2)
        steps.append(step)
    return steps, None


def _overview_trend(ws, bars, line):
    """Columns for one measure and a line for another, month by month."""
    b, l = bars.series[0], line.series[0]
    f = _series_f(b.cat)
    if not (f and _series_f(b.val) and _series_f(l.val)):
        return None

    def values(s):
        return [round(float(x.value), 2) if _is_figure(x.value) else 0
                for x in _ref_cells(ws, _series_f(s.val))]
    return {'months': [display(x) for x in _ref_cells(ws, f)],
            'bars': {'label': _series_name(ws, b) or 'Income', 'values': values(b)},
            'line': {'label': _series_name(ws, l) or 'Net income', 'values': values(l)}}


def _overview_points(cells, h, last):
    """Numbered lines under a heading: "1  Revenue was strong. …", or a
    recommendation with its own title in bold and the detail beside it."""
    items = []
    for r in range(h['r'] + 1, last + 1):
        row = [(c, cells[(r, c)]) for c in range(h['c1'], h['c2'] + 1) if (r, c) in cells]
        if not row:
            continue
        lead = row[0][1].value
        if (row[0][0] == h['c1'] and _is_figure(lead) and float(lead).is_integer()
                and len(row) >= 2):
            texts = [x for _, x in row[1:]]
            titled = len(texts) >= 2 and bool(texts[0].font and texts[0].font.b)
            items.append({'n': str(int(lead)),
                          'title': display(texts[0]) if titled else None,
                          'text': ' '.join(display(x) for x in texts[1 if titled else 0:])})
        elif items:
            break
        else:
            return None
    return items or None


def _overview_table(cells, first, h, last, tab):
    """A table under a heading: a bold header line, then rows down to the first
    gap, and a note when the line after them is words alone across the table."""
    body, note = [], None
    for r in range(h['r'] + 1, last + 1):
        row = {c: cells[(r, c)] for c in range(h['c1'], h['c2'] + 1) if (r, c) in cells}
        if not row:
            if body:
                break
            continue
        lead = row.get(h['c1'])
        if not body:
            if len(row) < 2 or not all(x.font and x.font.b for x in row.values()):
                return None
        elif (len(row) == 1 and lead is not None and isinstance(lead.value, str)
              and not (lead.font and lead.font.b) and first.get((r, h['c1']), h['c1']) >= h['c2']):
            note = display(lead)
            break
        body.append((r, row))
    if len(body) < 2:
        return None
    cols = sorted({c for _, row in body for c in row})
    figures, rows = [], []
    for r, row in body[1:]:
        for c in cols:
            if c in row and _is_figure(row[c].value):
                figures.append((f'{tab}!{get_column_letter(c)}{r}', display(row[c]), row[c].value))
        label = row.get(cols[0]) or next(iter(row.values()))
        rows.append({'cells': [display(row[c]) if c in row else None for c in cols],
                     'tones': [_tone(row[c]) if c in row else None for c in cols],
                     'bold': bool(label.font and label.font.b)})
    head = body[0][1]
    return {'header': [display(head[c]) if c in head else None for c in cols],
            'rows': rows, 'note': note}, figures


def overview(wb, tab):
    """The overview tab, section by section in the order the sheet reads.

    Returns (overview, figures, warnings). figures pairs each figure's text with
    the value behind it, so the check can read one back against the other.
    """
    ws = wb[tab]
    first, covered = _merges(ws)
    cells = {(c.row, c.column): c for row in ws.iter_rows() for c in row
             if (c.row, c.column) not in covered and display(c) is not None}
    if not cells:
        return None, [], [f'{tab} is empty']

    # The title is the first thing on the sheet, and its width is the page's.
    tr, tc = min(cells)
    page = (tc, first.get((tr, tc), max(c for _, c in cells)))
    mid = (page[0] + page[1]) / 2

    def side(c1, c2):
        if c1 <= page[0] and c2 >= page[1]:
            return 'full'
        return 'right' if c1 > mid else 'left'

    heads = [{'r': r, 'c1': c, 'c2': first.get((r, c), c), 'text': display(cell), 'chart': None}
             for (r, c), cell in sorted(cells.items()) if (r, c) != (tr, tc) and _is_heading(cell)]

    # A chart belongs to the nearest heading above it that it sits under. Read
    # through openpyxl's private _charts: it has no public way to read them back.
    for ch in getattr(ws, '_charts', []):
        anchor = ch.anchor
        top = anchor._from.row + 1                      # 0-based, so this is its first row
        c1 = anchor._from.col + 1
        c2 = anchor.to.col if getattr(anchor, 'to', None) is not None else c1
        over = [h for h in heads if h['r'] < top and h['c1'] <= c2 and h['c2'] >= c1]
        if over:
            max(over, key=lambda h: h['r'])['chart'] = ch

    sections, figures, warnings = [], [], []
    for i, h in enumerate(heads):
        below = [x['r'] for x in heads[i + 1:]
                 if x['r'] > h['r'] and x['c1'] <= h['c2'] and x['c2'] >= h['c1']]
        last = min(below) - 1 if below else ws.max_row
        sec = {'r': h['r'], 'side': side(h['c1'], h['c2']), 'heading': h['text']}
        if h['chart'] is not None:
            parts = getattr(h['chart'], '_charts', None) or [h['chart']]
            bar = next((p for p in parts if type(p).__name__ == 'BarChart'), None)
            line = next((p for p in parts if type(p).__name__ == 'LineChart'), None)
            if bar is not None and bar.grouping in ('stacked', 'percentStacked'):
                steps, problem = _overview_walk(ws, bar)
                if steps:
                    sections.append({'kind': 'walk', **sec, 'steps': steps})
                    figures += [(f'{h["text"]}: {x["label"]}', x['text'], x['to'] - x['from'])
                                for x in steps if x['text']]
                else:
                    warnings.append(f'{h["text"]}: {problem}')
            elif bar is not None and line is not None and _overview_trend(ws, bar, line):
                sections.append({'kind': 'trend', **sec, **_overview_trend(ws, bar, line)})
            else:
                warnings.append(f'{h["text"]}: left out, a chart the app does not draw')
            continue
        items = _overview_points(cells, h, last)
        if items:
            sections.append({'kind': 'points', **sec, 'items': items})
            continue
        table = _overview_table(cells, first, h, last, tab)
        if table:
            sections.append({'kind': 'table', **sec, **table[0]})
            figures += table[1]
            continue
        warnings.append(f'{h["text"]}: left out, nothing under it the app reads')

    return ({'tab': tab, 'title': display(cells[(tr, tc)]), 'sections': sections},
            figures, warnings)


def _overview_ties(ov, wb, rows):
    """Where the overview disagrees with the client's own FS-R.

    Reported rather than refused: the statements are still right, and a walk
    that does not tie is for Paul to look at, not a reason to hold back his
    figures. In October 2026 all six tied to the cent.
    """
    ym = overview_month(ov['tab'])
    if not rows or not rows.get('netIncome') or not ym or ym[0] not in (2025, 2026):
        return []
    fs = wb['FS-R']

    def fsr(row, year, m):
        v = fs.cell(row, (C25 if year == 2025 else C26) + m).value
        return float(v) if _is_figure(v) else 0.0

    year, m = ym
    month_before = (year, m - 1) if m else (year - 1, 11)
    out = []
    for sec in ov['sections']:
        if sec['kind'] == 'walk':
            steps = sec['steps']
            ends = ((steps[0], month_before), (steps[-1], (year, m)))
            for step, (y, mm) in ends:
                if step['kind'] == 'total' and y in (2025, 2026):
                    want = fsr(rows['netIncome'], y, mm)
                    if abs(step['to'] - want) > 0.01:
                        out.append(f"Overview: {step['label']} is {step['to']:,.2f} on the "
                                   f"profit walk and {want:,.2f} on FS-R")
            at = None
            for step in steps:
                if step['kind'] == 'total' and at is not None and abs(step['to'] - at) > 0.02:
                    out.append(f"Overview: the profit walk adds up to {at:,.2f} but ends "
                               f"on {step['to']:,.2f}")
                at = step['to']
        elif sec['kind'] == 'trend':
            for series in (sec['bars'], sec['line']):
                name = series['label'].strip().lower()
                row = rows.get('netIncome') if name == 'net income' else (
                    rows.get('totalIncome') if name in ('income', 'total income') else None)
                if not row:
                    continue
                for mon, v in zip(sec['months'], series['values']):
                    k = (mon or '')[:3].lower()
                    if k in _MONTHS and abs(v - fsr(row, year, _MONTHS.index(k))) > 0.01:
                        out.append(f"Overview: {series['label']} for {mon} is {v:,.2f} on the "
                                   f"chart and {fsr(row, year, _MONTHS.index(k)):,.2f} on FS-R")
    return out


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


def _fmt_overview(ov):
    out = ['{', f'  tab: {_j(ov["tab"])},', f'  title: {_j(ov["title"])},', '  sections: [']
    for sec in ov['sections']:
        out.append('    { ' + ', '.join(f'{k}: {_j(sec[k])}' for k in ('kind', 'r', 'side', 'heading')) + ',')
        if sec['kind'] == 'points':
            out.append('      items: [')
            out += [f'        {{ n: {_j(p["n"])}, title: {_j(p["title"])}, text: {_j(p["text"])} }},'
                    for p in sec['items']]
            out.append('      ] },')
        elif sec['kind'] == 'table':
            out.append(f'      header: {_j(sec["header"])},')
            out.append('      rows: [')
            out += [f'        {{ cells: {_j(x["cells"])}, tones: {_j(x["tones"])}, bold: {_j(x["bold"])} }},'
                    for x in sec['rows']]
            out.append('      ],')
            out.append(f'      note: {_j(sec["note"])} }},')
        elif sec['kind'] == 'walk':
            out.append('      steps: [')
            out += [f'        {{ label: {_j(x["label"])}, kind: {_j(x["kind"])}, from: {_j(x["from"])}, '
                    f'to: {_j(x["to"])}, text: {_j(x["text"])} }},' for x in sec['steps']]
            out.append('      ] },')
        else:
            out.append(f'      months: {_j(sec["months"])},')
            for k in ('bars', 'line'):
                out.append(f'      {k}: {{ label: {_j(sec[k]["label"])}, values: {_j(sec[k]["values"])} }},')
            out[-1] = out[-1][:-1] + ' },'
    out += ['  ],', '}']
    return '\n'.join(out)


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
    report = {'roadmap': False, 'findings': False, 'tldr': False, 'budget': False,
              'overview': False}

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

    # First, as it is first in the workbook; or with the notes, for staff only
    # (OVERVIEW_FOR_CLIENTS above).
    overview_part = None
    overview_name = overview_tab(wb)
    if overview_name:
        ov, _, ov_warnings = overview(wb, overview_name)
        if ov and ov['sections']:
            overview_part = ('Overview', _fmt_overview(ov))
            report['overview'] = overview_name + ('' if OVERVIEW_FOR_CLIENTS else ' (staff only)')
            if OVERVIEW_FOR_CLIENTS:
                sheet_parts.insert(0, overview_part)
        if ov_warnings:
            report['overviewWarnings'] = ov_warnings

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
    if overview_part and not OVERVIEW_FOR_CLIENTS:
        notes_parts.append(overview_part)

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


def _compare(a, b, path, out):
    """How many values two trees hold; where they part goes into out."""
    if isinstance(a, dict) and isinstance(b, dict):
        n = 0
        for k in sorted(set(a) | set(b)):
            if k in a and k in b:
                n += _compare(a[k], b[k], f'{path}.{k}', out)
            else:
                out.append(f'{path}.{k}: on one side only')
        return n
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append(f'{path}: {len(a)} entries vs {len(b)}')
            return 1
        return sum(_compare(x, y, f'{path}[{i}]', out) for i, (x, y) in enumerate(zip(a, b)))
    if not _same(a, b):
        out.append(f'{path}: {a!r} vs {b!r}')
    return 1


def verify_against_workbook(path, sheets_ts, notes_ts, bs, pl, rows=None):
    """Every figure in the generated modules, checked back against the workbook.

    Run before anything is published. A client's figures reaching the app
    unchecked is the failure worth ruling out, and it is cheap to rule out.

    rows, the client's row map, lets the overview be tied to their FS-R; what
    does not tie comes back under 'warnings', for a person to look at.
    """
    wb = openpyxl.load_workbook(path, data_only=True)
    data = _values(sheets_ts) | _values(notes_ts)

    checked = mismatches = 0
    problems, warnings = [], []

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

    # The overview is read again from the workbook and must come out the same as
    # what was written; then each figure's text is read back against its value,
    # and the walk and the month-by-month chart are tied to the client's FS-R.
    if 'Overview' in data:
        stored = data['Overview']
        if stored.get('tab') not in wb.sheetnames:
            mismatches += 1
            problems.append(f'Overview: the workbook has no tab {stored.get("tab")!r}')
        else:
            fresh, figures, _ = overview(wb, stored['tab'])
            diffs = []
            checked += _compare(fresh, stored, 'Overview', diffs)
            mismatches += len(diffs)
            problems += diffs
            for where, text, value in figures:
                checked += 1
                if not _reads_back(text, value):
                    mismatches += 1
                    problems.append(f'Overview {where}: {value!r} shown as {text!r}')
            warnings += _overview_ties(stored, wb, rows)

    return {'figures': checked, 'mismatches': mismatches, 'problems': problems[:20],
            'warnings': warnings}
