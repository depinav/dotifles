#!/bin/bash

APP=$1
WID=$AEROSPACE_WINDOW_ID

# Get monitor info
MONITORS=$(aerospace list-monitors)
MONITOR_COUNT=\((echo "\)MONITORS" | wc -l | tr -d ' ')

# Detect if we are exclusively on the built-in laptop screen
IS_LAPTOP_ONLY=false
if [ "\(MONITOR_COUNT" -eq 1 ] && echo "\)MONITORS" | grep -qi "built-in"; then
    IS_LAPTOP_ONLY=true
fi

# Variables to hold routing and layout instructions
TARGET=""
# DIRECTION=""
# RESIZE=""

if [ "$IS_LAPTOP_ONLY" = true ]; then
    # --- 1. Built-in Macbook Pro Display Only ---
    case "$APP" in
        "browser")  TARGET=1 ;;
        "zed")      TARGET=2 ;;
        "ghostty")  TARGET=3 ;;
        "slack")    TARGET=4 ;;
        "obsidian") TARGET=4 ;;
    esac
else
    # --- 2. Dual Monitors OR Single Ultrawide ---
    case "$APP" in
        "browser")
            TARGET=1
            DIRECTION="right"
            RESIZE="width +500" # Expand to take ~2/3 width
            ;;
        "slack")
            TARGET=1
            DIRECTION="left"
            ;;
        "obsidian")
            TARGET=1
            DIRECTION="down" # 'down' forces a vertical split with whatever is on the left
            ;;
        "ghostty")
            TARGET=2
            DIRECTION="left"
            ;;
        "zed")
            TARGET=2
            DIRECTION="right"
            RESIZE="width +500" # Expand to take ~2/3 width
            ;;
    esac
fi

# Apply the configurations
if [ -n "$TARGET" ]; then
    # 1. Move window to correct workspace
    aerospace move-node-to-workspace "\(TARGET" --window-id "\)WID"

    # 2. Apply positioning and resizing (only for ultrawide/dual)
    if [ -n "$DIRECTION" ]; then
        # Tiny delay to allow AeroSpace to register the window in the new workspace's tree
        sleep 0.2

        # Bring focus to the window so layout commands apply directly to it
        aerospace focus --window-id "$WID"

        # Push the window in the desired direction
        aerospace move "$DIRECTION"

        # Apply pixel resizing to achieve the 2/3 layout
        if [ -n "$RESIZE" ]; then
            aerospace resize smart $RESIZE
        fi
    fi
fi
