
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path = path
        self.attributes = []
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        self.attributes.append((tag, dict(attrs)))

root = Path("dist")
pages = {path: Page(path) for path in root.rglob("*.html")}
issues = []
for source, page in pages.items():
    relative = source.relative_to(root)
    top = relative.parts[0]
    language = top if top in {"es", "ar", "sw", "fr"} else "en"
    html = next(attrs for tag, attrs in page.attributes if tag == "html")
    assert html["lang"] == language
    assert html["dir"] == ("rtl" if language == "ar" else "ltr")
    assert len([1 for tag, attrs in page.attributes if tag == "a" and "hreflang" in attrs]) == 10
    for tag, attrs in page.attributes:
        if tag == "a" and attrs.get("href", "").startswith("/"):
            url = urlsplit(attrs["href"])
            target = root / url.path.strip("/") / "index.html"
            if target not in pages:
                issues.append(f"{source}: {url.path}")
        if tag == "img":
            assert attrs["alt"]
            assert (root / attrs["src"].lstrip("/")).is_file()
    if relative.parent.name in {"enrollment", "contact"}:
        forms = [attrs for tag, attrs in page.attributes if tag == "form"]
        assert len(forms) == 1 and forms[0]["data-kind"] == relative.parent.name
        assert forms[0]["data-success"].endswith("/thank-you/")
        assert all(tag != "input" or attrs.get("name") != "child_name" for tag, attrs in page.attributes)
    if len(relative.parts) >= 3 and relative.parts[-3] == "programs":
        assert any("?age=" in attrs.get("href", "") for tag, attrs in page.attributes if tag == "a")

assert not issues, issues
for language in ["en", "es", "ar", "sw", "fr"]:
    location = root if language == "en" else root / language
    tour = pages[location / "tour/index.html"]
    form = next(attrs for tag, attrs in tour.attributes if tag == "form")
    names = {attrs.get("name") for tag, attrs in tour.attributes if tag in {"input", "select", "textarea"}}
    assert form["name"] == "tour-request" and form["netlify-honeypot"] == "bot-field"
    assert form["action"].endswith("/thank-you/")
    assert {"form-name","bot-field","name","phone","email","age_group","start_month","tour_window","heard_about_us","notes"} == names
    assert any(tag == "link" and obj.get("rel") == "canonical" and obj["href"].startswith("https://hearts25.com/") for tag, obj in tour.attributes)
assert "Coming Soon" in (root / "index.html").read_text(encoding="utf-8")
assert "Coming Soon" in (root / "virtual-tour/index.html").read_text(encoding="utf-8")
assert "APPLICATION FEE WAIVED" in (root / "enrollment/index.html").read_text(encoding="utf-8")
assert "FREE for families" in (root / "tuition-assistance/index.html").read_text(encoding="utf-8")
print(f"Verified {len(pages)} generated pages, local links, five language routes, RTL, forms and offer copy.")


