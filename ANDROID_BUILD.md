# Android Build Instructions

This document outlines the steps to package Nahan as a Trusted Web Activity (TWA) for Android using Bubblewrap.

## Prerequisites

1.  **Deploy Changes:**
    You **MUST** push the latest changes to GitHub Pages before running Bubblewrap.
    The error `Unexpected token '<'` occurs because the live site does not yet have the updated `manifest.json`.

    ```bash
    git add .
    git commit -m "chore: prepare for android build"
    git push
    ```
    *Wait for the GitHub Action to complete deployment.*

2.  **Install Bubblewrap CLI:**
    ```bash
    npm i -g @bubblewrap/cli
    ```

## Build Steps

1.  **Initialize Project:**
    Only run this *after* deployment is complete and `https://aryan-mor.github.io/Nahan/manifest.json` is accessible.
    ```bash
    bubblewrap init --manifest=https://aryan-mor.github.io/Nahan/manifest.json
    ```
    *Alternatively, since `twa-manifest.json` is already configured locally, you can skip `init` and try `build` directly if assets are available.*

2.  **Build the Android App:**
    Run the build command to generate the APK and App Bundle (AAB):
    ```bash
    bubblewrap build
    ```

## Post-Build Verification

1.  **Digital Asset Links:**
    During the build/signing process, you will obtain a SHA-256 certificate fingerprint.
    
    Update `public/.well-known/assetlinks.json` with this fingerprint:
    ```json
    "sha256_cert_fingerprints": ["<YOUR_GENERATED_SHA256>"]
    ```

2.  **Deploy:**
    Deploy the updated `assetlinks.json` to your host (`https://aryan-mor.github.io/Nahan/.well-known/assetlinks.json`) to verify ownership.
