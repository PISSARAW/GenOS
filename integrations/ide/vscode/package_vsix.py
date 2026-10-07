"""Package the dependency-free reference extension without a marketplace upload."""
import json
import sys
import zipfile
from pathlib import Path


def package(destination):
    root = Path(__file__).resolve().parent
    meta = json.loads((root / "package.json").read_text(encoding="utf-8"))
    manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="fr-FR" Id="{meta['name']}" Version="{meta['version']}" Publisher="{meta['publisher']}"/>
<DisplayName>GenOS Runtime</DisplayName><Description xml:space="preserve">GenOS runtime client</Description>
<Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.100.0"/>
<Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/>
<Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/></Properties></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
<Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>
</PackageManifest>'''
    content_types = '''<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="json" ContentType="application/json"/>
<Default Extension="cjs" ContentType="application/javascript"/>
<Default Extension="vsixmanifest" ContentType="text/xml"/></Types>'''
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("extension.vsixmanifest", manifest)
        archive.writestr("[Content_Types].xml", content_types)
        for name in ("package.json", "extension.cjs", "client.cjs"):
            archive.write(root / name, f"extension/{name}")


if __name__ == "__main__":
    package(sys.argv[1])
