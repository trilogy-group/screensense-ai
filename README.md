# ScreenSense AI: Your Intelligent Digital Copilot

[![Downloads](https://img.shields.io/badge/dynamic/json?label=Downloads&query=downloads&url=https://github.com/trilogy-group/screensense-ai-releases/releases)](https://screensenseai.ti.trilogy.com/) [![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) **See What You Mean. Act on It.**

ScreenSense AI is a revolutionary platform that transforms how you interact with your computer. By combining cutting-edge computer vision, natural language processing, and system control, ScreenSense AI _understands everything happening on your screen_ and responds to your voice commands with unprecedented accuracy and intelligence. It's not just a voice assistant; it's a digital copilot that _sees, understands, and acts_.

## Core Capabilities:

- **Universal Screen Understanding:** ScreenSense AI analyzes _any_ on-screen content – text, images, documents, application interfaces, and even video. It goes beyond simple OCR to understand the _context_ and _meaning_ of what's displayed.
- **Natural Language Mastery:** Communicate with your computer using natural, conversational language. No need to memorize specific commands or keywords. Just tell ScreenSense AI what you want to do.
- **Cross-Application Action:** Unlike traditional voice assistants, ScreenSense AI works seamlessly across _any_ application or website. It can perform actions, transfer data, and automate workflows that span multiple programs.
- **Intelligent Automation:** Automate complex, multi-step tasks with simple voice commands. From summarizing reports to creating presentations, scheduling meetings to debugging code, ScreenSense AI streamlines your digital life.
- **Contextual Memory:** ScreenSense AI remembers your preferences, past interactions, and ongoing tasks, providing a truly personalized and adaptive experience.
- **Extensible Assistant Architecture:** ScreenSense AI is designed as a platform for building _specialized assistants_. This allows for rapid development of new capabilities tailored to specific tasks and industries. (See "Available Assistants" below).
- **Mac and Windows Support:** Enjoy the power of ScreenSense AI on your preferred operating system.

## Available Assistants:

ScreenSense AI comes with a growing library of pre-built assistants, and its architecture allows for easy creation of new ones:

- **Daily Guide:** Manage your schedule, emails, reminders, and other everyday tasks.
- **Document Expert:** Effortlessly edit, format, summarize, and manipulate documents using voice commands.
- **Tutor:** Provides personalized learning support, explaining complex concepts and guiding you through interactive exercises.
- **Knowledge Curator:** Automatically transforms your work sessions into structured documentation _without interrupting your flow_.
- **Patent Assistant:** Guides inventors through the patent documentation process via an intelligent interview.
- _(More assistants coming soon!)_

## Getting Started:

1.  **Download:** Download the latest version of ScreenSense AI for your operating system (Mac or Windows) [https://github.com/trilogy-group/screensense-ai-releases/releases]
2.  **Installation:** Follow the on-screen instructions to install ScreenSense AI.
3.  **Launch:** Launch ScreenSense AI and grant the necessary permissions (screen recording, accessibility access).
4.  **Start Talking!** Begin interacting with ScreenSense AI using natural voice commands. Experiment with different assistants and discover the power of context-aware computing.

## Example Use Cases:

- "Summarize this article and save it as a PDF."
- "Create a presentation based on the data in this spreadsheet."
- "Schedule a meeting with John next Tuesday at 2 PM and send him an invite."
- "Find all emails from Sarah about the project proposal."
- "Translate this paragraph into Spanish."
- "Debug this Python code." (When Code Assistant is available)
- "Explain the concept of photosynthesis." (Using the Tutor assistant)
- "Document my process for troubleshooting this network connection." (Using Knowledge Curator)

## Developing Custom Assistants (For Developers):

ScreenSense AI's extensible architecture allows developers to create custom assistants tailored to specific needs.

## Running the electron app

Run the following commands to run the electron app:

```bash
npm install
npm run electron-dev
```

Note: In case you face issues with node-gyp on mac, follow the instructions below to create a virtual environment and install the dependencies, and then run

```
export PYTHON="$(pwd)/.venv/bin/python"
npm install
```

## Building the electron app

_Note: I had to install `xcode` to get this to work, since it required the `unordered_map` cpp header file. The xcode-select cli tool was not enough._

```bash
python3 -m venv .venv && source .venv/bin/activate && python3 -m pip install setuptools
npm run electron-build
```

## Sign and Notarize

0. You need to have an Apple Developer account.

1. You need to install the following certificates:

a. From Apple's [Certificate Authority](https://www.apple.com/certificateauthority/), download the following - Apple Root CA - G2 - Apple Worldwide Developer Relations CA - G2 - Apple Worldwide Developer Relations Certificate Authority - Developer ID Certification Authority
b. A developer ID Application certificate from [here](https://developer.apple.com/account/resources/certificates/add). You need to generate a Certificate Signing Request (CSR) from your mac to generate the certificate.

2. Create an App Specific Password from [here](https://appleid.apple.com/account/manage)

3. Set the following environment variables:

```bash
export APPLE_ID="sahil.marwaha@trilogy.com" # Your Apple email
export APPLE_APP_SPECIFIC_PASSWORD="YOUR_APP_SPECIFIC_PASSWORD"  # Generate this at appleid.apple.com
export APPLE_ID_PASSWORD="YOUR_APP_SPECIFIC_PASSWORD"  # same as above
export APPLE_TEAM_ID="KRY77A2RML" # Your Apple Team ID
```

4. Add the following to your package.json:  
   a. In your mac build

   ```json
   "mac": {
     "hardenedRuntime": true,
     "gatekeeperAssess": false,
     "entitlements": "electron/entitlements.mac.plist",
     "entitlementsInherit": "electron/entitlements.mac.plist",
     "identity": "G-DEV FZ-LLC (KRY77A2RML)",
     "forceCodeSigning": true
   }
   ```

   b. For notarisation,

   ```json
   "afterSign": "electron-builder-notarize"
   ```

   And add this to your dev dependencies:

   ```bash
   npm install electron-builder-notarize --save-dev
   ```

5. Run the following command to build the app, it will sign and notarize the app as well:

```bash
source .venv/bin/activate && npm run electron-build
```

## License:

This project is licensed under the [MIT License](LICENSE) - see the LICENSE file for details.

## Contact:

For questions, support, or business inquiries, please contact us at [sahil.marwaha@trilogy.com](mailto:sahil.marwaha@trilogy.com).
