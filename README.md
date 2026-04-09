# Random Album Generator

A PowerShell-based GUI application that generates random album recommendations. 

> **Note:** This project was "vibe coded"

## Features
* Provides random album selections through an easy-to-use graphical interface.
* Filters or selects based on descriptors and genres.
* **Built-in Data Entry Tool**: Includes a secondary GUI tool to easily input new albums, merge data, and map out your JSON genre hierarchy and descriptor references automatically!

## Data Source
The data used by this application is sourced from [Rate Your Music (RYM)](https://rateyourmusic.com/). You can often find datasets with this structure online, I found one here: [https://www.kaggle.com/datasets/tobennao/rym-top-5000/data]).

**Note:** To respect RYM's Terms of Service regarding data scraping and redistribution, the actual data files are **not included** in this repository. 

## Setup & Installation
To run this application locally, you will need to provide your own data files in the `Data/` directory.

### Quick Start (Sample Data)
If you just want to test out the GUI and see how the application works, you can generate sample data instantly:
1. Double-click **`GenerateSampleData.bat`**. This builds mock data inside the `Data/Staging/` folder.
2. Double-click **`LaunchDataEntry.bat`** and click `"Merge Staging to Main & Auto-Generate Configs"`. This pushes the data into your main `Data/` folder.
3. Double-click **`Launch.bat`** to start the app!

### Custom Data Entry & Auto-Generation (Recommended)
You do **not** need to manually format the complicated `filtered_hierarchy.json` genre tree or the `descriptors_reference.csv` counts by hand. Our built-in tool does that for you! 
1. Double-click **`LaunchDataEntry.bat`** to open the Data Entry Tool.
2. You can manually enter new album details (Album, Artist, Release Date, Primary Genres, Descriptors) and hit **Save Entry to Staging**.
3. When you're done staging new albums, click **"Merge Staging to Main & Auto-Generate Configs"**. 
4. The tool automatically merges your staged albums into your main dataset (`rym_clean1.csv`), then scans all the genres and descriptors it finds and **auto-generates** a perfectly mapped JSON hierarchy and a counted references CSV. 

### Advanced: Using an external dataset
If you have your own RYM dataset export, you can place it inside the `Data/` folder. Ensure the files match the expected layouts below:
   
   * **`rym_clean1.csv`** - The main dataset of albums. Must include the following headers (all quoted strings):
     `H1`, `position`, `release_name`, `artist_name`, `release_date`, `release_type`, `primary_genres`, `secondary_genres`, `descriptors`, `avg_rating`, `rating_count`, `review_count`, `listened`
     *(Example row: `"1","1","OK Computer","Radiohead","1997-06-16","album","Alternative Rock, Art Rock","NA","melancholic, anxious","4.24","74027","1541","0"`)*
   
   * **`filtered_hierarchy.json`** - A nested JSON array mapping the genre structure. Required format:
     ```json
     {
       "name": "Root",
       "children": [
         {
           "name": "Genres",
           "children": [...]
         }
       ]
     }
     ```
   
   * **`descriptors_reference.csv`** - Reference for frequency of album descriptors. Must have these exact headers:
     `descriptor`, `count`
     *(Example row: `malevocals,3542`)*

## Usage
Once your data files are in place, simply run the batch script to launch the GUI:

Double-click `Launch.bat` or run it from the command line:
```cmd
Launch.bat
```

