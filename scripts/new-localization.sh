SCRIPT_DIR="$(dirname "$0")"

msginit -i $SCRIPT_DIR/../po/Localization.pot -l $1 --no-wrap -o $SCRIPT_DIR/../po/Localization_$1.po
