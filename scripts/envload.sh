# Safe .env loader: values may contain & ? etc. Quote on export.
_ph_loadenv() {
  local f="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env}" line key val
  [ -f "$f" ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line#"${line%%[![:space:]]*}"}"
    case "$line" in ''|\#*) continue;; *=*) ;; *) continue;; esac
    key="${line%%=*}"; val="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
    case "$val" in \"*\") val="${val:1:${#val}-2}";; \'*\') val="${val:1:${#val}-2}";; esac
    export "$key=$val"
  done < "$f"
}
_ph_loadenv "$@"
