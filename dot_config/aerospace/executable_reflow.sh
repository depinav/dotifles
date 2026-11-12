#!/bin/bash

# Fetch all existing windows and output their Bundle ID and Window ID
aerospace list-windows --all --format "%{app-bundle-id} %{window-id}" | while read -r app_id wid; do
    case "$app_id" in
        "com.google.Chrome")
            ~/.config/aerospace/router.sh browser "$wid" ;;
        "dev.zed.Zed")
            ~/.config/aerospace/router.sh zed "$wid" ;;
        "com.mitchellh.ghostty")
            ~/.config/aerospace/router.sh ghostty "$wid" ;;
        "com.tinyspeck.slackmacgap")
            ~/.config/aerospace/router.sh slack "$wid" ;;
        "md.obsidian")
            ~/.config/aerospace/router.sh obsidian "$wid" ;;
    esac
done
