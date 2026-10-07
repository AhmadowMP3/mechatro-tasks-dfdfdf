# The Word engine used by "Import from Word" (exact layout): Gotenberg runs
# LibreOffice (Word -> PDF) and Chromium (letterhead -> PDF).
#
# Word files keep their exact line breaks only when the fonts they name are
# installed, so the common Office fonts are added on top of the base image:
#   - Carlito / Caladea: metric-compatible with Calibri / Cambria
#   - Noto: fallback for Arabic and anything else
#   - Microsoft core fonts: Arial, Times New Roman, Courier New, Verdana...
# Any extra licensed fonts dropped into ./fonts are installed as well.
FROM gotenberg/gotenberg:8

USER root

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      fonts-crosextra-carlito \
      fonts-crosextra-caladea \
      fonts-noto-core \
 && rm -rf /var/lib/apt/lists/*

# The Microsoft core fonts are fetched from an external mirror at install time.
# A mirror outage must not break the deploy: the engine still works (with
# metric-compatible substitutes), so this step only warns.
RUN . /etc/os-release \
 && echo "deb http://deb.debian.org/debian ${VERSION_CODENAME} contrib" > /etc/apt/sources.list.d/contrib.list \
 && echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
 && apt-get update \
 && (apt-get install -y --no-install-recommends ttf-mscorefonts-installer \
     || echo "WARNING: Microsoft core fonts not installed; substitutes will be used") \
 && rm -rf /var/lib/apt/lists/*

COPY fonts/ /usr/local/share/fonts/mechatro/
RUN fc-cache -f

USER gotenberg
