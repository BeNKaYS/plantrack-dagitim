#!/usr/bin/env bash
# Plantrack kurulumu (macOS) — çift tıklayın.
cd "$(dirname "$0")" || exit 1

NODE_EXEC=""
for n in "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node; do
  if [ -n "$n" ] && [ -x "$n" ]; then NODE_EXEC="$n"; break; fi
done

if [ -z "$NODE_EXEC" ]; then
  echo "Node.js bulunamadı."
  echo "Kurmak için:  brew install node   ya da   https://nodejs.org (LTS)"
  read -r -p "Kapatmak için Enter'a basın..." _
  exit 1
fi

"$NODE_EXEC" kurulum/kur.js "$@"
KOD=$?
echo
read -r -p "Kapatmak için Enter'a basın..." _
exit $KOD
