SCRIPT_DIR="$(dirname "$0")"

for localization in "$SCRIPT_DIR"/../po/*.po
do
    msgmerge -N -U --no-wrap $localization $SCRIPT_DIR/../po/Localization.pot
done
