# Changelog

## [v0.9.0] - Phase 9 Automation

### Added
- Backend server using Node.js and Express
- AI Tutor integration with Google Gemini 2.5 Flash
- Automated PDF Parsing for Weekly Knowledge using pdf-parse and Gemini
- MS Teams Notification sync simulation for urgent tasks
- Dashboard UI Premium Revamp with gradient cards
- `.env` configuration file support for API keys

### Changed
- Converted frontend from static mockup to dynamic API integration
- Replaced setTimeout simulations with actual fetch calls to local backend
- Moved from mock file reading to actual PDF memory buffering and parsing

### Security
- Added `.gitignore` to prevent tracking `.env` and `node_modules`
