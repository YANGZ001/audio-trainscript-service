## ADDED Requirements

### Requirement: Stale cache files are evicted by a periodic sweep
The system SHALL run a periodic background sweep that deletes audio cache files whose `mtime` is 90 days or older from all three cache directories (`/data/bilibili-audio/`, `/data/snipd-audio/`, `/data/xiaoyuzhou-audio/`), so that cache storage does not grow without bound. The sweep SHALL run on the worker loop, guarded so it executes at most once per 24-hour interval.

#### Scenario: Stale file is deleted by the sweep
- **WHEN** the periodic sweep runs and finds a cache file whose `mtime` is 90 days or older
- **THEN** the system SHALL delete that file from disk

#### Scenario: Fresh file is retained by the sweep
- **WHEN** the periodic sweep runs and finds a cache file whose `mtime` is less than 90 days ago
- **THEN** the system SHALL leave that file in place

#### Scenario: Sweep deletes the sidecar metadata file alongside stale audio
- **WHEN** the periodic sweep deletes a stale audio file that has an adjacent `<id>.json` metadata sidecar that is also 90 days or older
- **THEN** the system SHALL delete the stale sidecar metadata file as well

#### Scenario: Sweep runs at most once per interval
- **WHEN** the worker loop iterates more frequently than once per 24 hours
- **THEN** the sweep SHALL execute only on iterations where at least 24 hours have elapsed since the previous sweep

#### Scenario: Sweep error does not crash the worker
- **WHEN** the sweep encounters a filesystem error while reading a directory or deleting a file
- **THEN** the error SHALL be logged and the worker loop SHALL continue processing jobs

#### Scenario: Sweep is a no-op when cache directories are empty or absent
- **WHEN** the periodic sweep runs and a cache directory does not exist or contains no files
- **THEN** the sweep SHALL complete without error and delete nothing
