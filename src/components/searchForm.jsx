import * as React from 'react';
import { Characters, Stages, CharacterStrings, StageStrings, moves } from '../static/meleeIds.js';
// import Button from '@mui/material/Button';
import { TextField, Button, Checkbox, Box, FormControlLabel, Select, FormControl, Autocomplete, MenuItem, Grid, CircularProgress } from '@mui/material';
import { isNull } from 'lodash';
import { Cookies } from 'electron';
const db = require('better-sqlite3')('melee.db');

class SearchForm extends React.Component {
  constructor(props) {
    super(props)
    let fields = ['playList', 'playReplay', 'startAt', 'attackingPlayer', 'attackingCharacter', 'defendingPlayer', 'defendingCharacter', 'stage', 'percent', 'time', 'didKill', 'moveCount']
    this.state = {
      attackingPlayerCode: null,
      attackingCharacter: '',
      defendingPlayerCode: null,
      defendingCharacter: '',
      stage: '',
      didKill: false,
      zeroToDeath: false,
      excludeAssigned: false,
      minimumDamage: '',
      maximumDamage: '',
      minimumMove: '',
      maximumMove: '',
      conversions: [],
      pageNumber: 0,
      maxPageNumber: undefined,
      sortField: 'startAt',
      sortDir: 'desc',
      fields: fields,
      conversionCount: undefined,
      pageSize: 20,
      comboContains: [],
      comboStartsWith: [],
      comboEndsWith: [],
      dbAttackingPlayerList: [],
      dbAttackingPlayerOpen: false,
      dbDefendingPlayerList: [],
      dbDefendingPlayerOpen: false
    }
    this.handleInputChange = this.handleInputChange.bind(this);
    this.handleAutocompleteInputChange = this.handleAutocompleteInputChange.bind(this);
    this.getConversions = this.getConversions.bind(this);
    this.handlePageSize = this.handlePageSize.bind(this);
    this.handleSortModelChange = this.handleSortModelChange.bind(this);
    this.clearConversions = this.clearConversions.bind(this)
    this.onPlayerDropdownLoad = this.onPlayerDropdownLoad.bind(this);
    this.characters = [];
    for (const character in Characters) {
      this.characters.push({
        value: Characters[character],
        label: character
      })
    }

    this.stages = [];
    for (const stage in Stages) {
      this.stages.push({
        value: Stages[stage],
        label: stage
      })
    }

    this.moves = [];
    for (const moveId in moves) {
      this.moves.push({
        value: parseInt(moveId)+1,
        label: moves[moveId].name
      })
    }
    // this.attackingPlayers = db.prepare('SELECT DISTINCT	attackingPlayer FROM conversions').all().map(x => x.attackingPlayer).filter(x => x);
    // this.defendingPlayers = db.prepare('SELECT DISTINCT	defendingPlayer FROM conversions').all().map(x => x.defendingPlayer).filter(x => x);

  }

  handleInputChange(event) {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const name = target.name;
    this.setState({
      [name]: value
    });
  }

  handleAutocompleteInputChange(event, value, name) {
    let stateValue = value?.value || value || null;
    this.setState({
      [name]: stateValue
    })
  }
  clearConversions() {
    this.setState({
      conversions: []
    })
  }

  getConversions() {
    let offset = (this.state.pageNumber) * this.state.pageSize;

    //TODO build query better
    //dynamic search solution
    let queryObject = {};
    let whereString = 'WHERE 1=1';
    if (this.state.attackingPlayerCode && this.state.attackingPlayerCode != '') {
      whereString += ' AND attackingPlayer = @attackingPlayerCode'
      queryObject.attackingPlayerCode = this.state.attackingPlayerCode;
    };
    if (this.state.attackingCharacter != '' || this.state.attackingCharacter === 0) {
      whereString += ' AND attackingCharacter = @attackingCharacter'
      //parseint needed for sqlite comparison
      queryObject.attackingCharacter = parseInt(this.state.attackingCharacter);
    };
    if (this.state.defendingPlayerCode && this.state.defendingPlayerCode != '') {
      whereString += ' AND defendingPlayer = @defendingPlayerCode'
      queryObject.defendingPlayerCode = this.state.defendingPlayerCode;
    };
    if (this.state.defendingCharacter != '' || this.state.defendingCharacter === 0) {
      whereString += ' AND defendingCharacter = @defendingCharacter'
      queryObject.defendingCharacter = parseInt(this.state.defendingCharacter);
    };
    if (this.state.stage != '' && this.state.stage) {
      whereString += ' AND stage = @stage'
      queryObject.stage = parseInt(this.state.stage);
    };
    if (this.state.minimumDamage) {
      whereString += ' AND percent >= @minimumDamage'
      queryObject.minimumDamage = parseInt(this.state.minimumDamage);
    };
    if (this.state.maximumDamage) {
      whereString += ' AND percent <= @maximumDamage';
      queryObject.maximumDamage = parseInt(this.state.maximumDamage);
    }
    if (this.state.minimumMove) {
      whereString += ' AND moveCount >= @minimumMoveCount';
      queryObject.minimumMoveCount = parseInt(this.state.minimumMove);
    }
    if (this.state.maximumMove) {
      whereString += ' AND moveCount <= @maximumMoveCount';
      queryObject.maximumMoveCount = parseInt(this.state.maximumMove);
    }
    if (this.state.didKill) {
      whereString += ' AND didKill = 1'
      //special case cause sqlite doesnt store true/false?
    };
    if (this.state.excludeAssigned) {
      whereString += ' AND id NOT IN (SELECT conversionId from playlistconversion)'
    }
    if (this.state.zeroToDeath) {
      whereString += ' AND zeroToDeath = 1'
    }
    //need a sql wizard
    if (this.state.comboContains.length > 0) {

    }
    if (this.state.comboStartsWith.length > 0) {
      let values = this.state.comboStartsWith.map(x => parseInt(x.value))
      for (let i = 0; i < values.length; i++) {
        whereString += ` AND id IN (SELECT conversionId FROM moves WHERE moveId = @startId${i} AND moveIndex = @startIndex${i})`
        queryObject[`startId${i}`] = values[i];
        queryObject[`startIndex${i}`] = i;
      }
    }
    if (this.state.comboEndsWith.length > 0) {
      let values = this.state.comboEndsWith.map(x => parseInt(x.value)).reverse()
      for (let i = 0; i < values.length; i++) {
        whereString += ` AND id IN (SELECT conversionId FROM moves WHERE moveId = @endId${i} AND inverseMoveIndex = @endIndex${i})`
        queryObject[`endId${i}`] = values[i];
        queryObject[`endIndex${i}`] = i;
      }
    }
    //is there a better way to get the count?            
    let query = `WITH cte AS(SELECT count(*) total FROM conversions ${whereString}) SELECT *, (select total from cte) as total FROM conversions ${whereString}`;
    query += ` ORDER BY ${this.state.sortField} ${this.state.sortDir} LIMIT ${this.state.pageSize} OFFSET ${offset}`
    console.log(whereString);
    console.log(queryObject)
    console.log(query)
    let prepQuery = db.prepare(query);
    let searchConversions = queryObject ? prepQuery.all(queryObject) : prepQuery.all();
    let maxPageCount = searchConversions.length > 0 ? Math.ceil(searchConversions[0].total / this.state.pageSize) : 1;
    this.setState({ conversions: searchConversions, maxPageNumber: maxPageCount, conversionCount: searchConversions[0]?.total || 0 });
  }

  setPage(pageNumber, event) {
    if (event) { event.preventDefault() };
    this.setState({ pageNumber: pageNumber },
      () => this.getConversions())
  }

  handleSortModelChange(event) {
    this.setState({ sortDir: event[0].sort, sortField: event[0].field },
      () => this.getConversions())
  }

  handlePageSize(newPageSize) {
    this.setState({ pageSize: newPageSize },
      () => this.getConversions())
  }

  //this could be rewritten to use an invisible window to fetch stuff in background
  //AttackingPlayer || DefendingPlayer
  onPlayerDropdownLoad(dropdown) {
    if (dropdown != 'AttackingPlayer' && dropdown != 'DefendingPlayer') { throw `Bad onPlayerDropdownLoad parameter - ${dropdown}` }
    let dbPlayerListState = `db${dropdown}List`
    let openState = `db${dropdown}Open`

    if (this.state[dbPlayerListState].length === 0) {
    this.setState({ [openState]: true }, () => {
      //necessary for loading icon to show
      (async () => {
        await sleep(1e1);
        let players = db.prepare(`SELECT DISTINCT ${dropdown} FROM conversions`).pluck().all().filter(x => x).sort();
        this.setState({ [dbPlayerListState]: players })
      })();
    })
    } else {
      this.setState({ [openState]: true});
    }
  }
  render() {
    let attackPlayerLoading = (this.state.dbAttackingPlayerList.length === 0 && this.state.dbAttackingPlayerOpen)
    let defendPlayerLoading = (this.state.dbDefendingPlayerList.length === 0 && this.state.dbDefendingPlayerOpen)

    return (
      <div>
        <Box onSubmit={(e) => this.setPage(0, e)}
          component="form"
          sx={{
            '& .MuiTextField-root': { m: 1, width: '25ch' }
          }}
          noValidate
          autoComplete="off"
        >
          {this.state.conversions?.length <= 0 &&
            <span>
              <Grid container >
                <Grid item>
                  <Autocomplete
                    autoSelect={true}
                    name="attackingPlayerCode"
                    options={this.state.dbAttackingPlayerList}
                    open={this.state.dbAttackingPlayerOpen}
                    loading={attackPlayerLoading}
                    onOpen={() => { this.onPlayerDropdownLoad('AttackingPlayer') }}
                    onClose={() => { this.setState({ dbAttackingPlayerOpen: false }) }}
                    value={this.state.attackingPlayerCode}
                    renderInput={(params) => (
                      <TextField {...params} label="Attacking Player Code" variant="standard"
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <React.Fragment>
                              {attackPlayerLoading ? <CircularProgress color="inherit" size={20} /> : null}
                              {params.InputProps.endAdornment}
                            </React.Fragment>
                          ),
                        }}
                      />
                    )
                    }
                    onChange={(event, value) => this.handleAutocompleteInputChange(event, value, 'attackingPlayerCode')}
                    getOptionLabel={(option) => {
                      return option
                    }}
                  />
                </Grid>
                <Grid item>
                  <Autocomplete
                    autoSelect={true}
                    name="attackingCharacter"
                    options={this.characters}
                    renderInput={(params) => (<TextField {...params} label="Attacking Character" variant="standard" />)}
                    onChange={(event, value) => this.handleAutocompleteInputChange(event, value, 'attackingCharacter')}
                    isOptionEqualToValue={(option, value) => option.value === value.value}
                  />
                </Grid>
              </Grid>
              <Grid container >
                <Autocomplete
                  autoSelect={true}
                  name="defendingPlayerCode"
                  options={this.state.dbDefendingPlayerList}
                  open={this.state.dbDefendingPlayerOpen}
                  loading={defendPlayerLoading}
                  onOpen={() => { this.onPlayerDropdownLoad('DefendingPlayer') }}
                  onClose={() => { this.setState({ dbDefendingPlayerOpen: false }) }}
                  value={this.state.defendingPlayerCode}
                  renderInput={(params) => (
                    <TextField {...params} label="Defending Player Code" variant="standard"
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <React.Fragment>
                            {defendPlayerLoading ? <CircularProgress color="inherit" size={20} /> : null}
                            {params.InputProps.endAdornment}
                          </React.Fragment>
                        ),
                      }}
                    />
                  )
                  }
                  onChange={(event, value) => this.handleAutocompleteInputChange(event, value, 'defendingPlayerCode')}
                  getOptionLabel={(option) => {
                    return option
                  }}
                />
                <Grid item>
                  <Autocomplete
                    autoSelect={true}
                    name="defendingCharacter"
                    options={this.characters}
                    renderInput={(params) => (<TextField {...params} label="Defending Character" variant="standard" />)}
                    onChange={(event, value) => this.handleAutocompleteInputChange(event, value, 'defendingCharacter')}
                    isOptionEqualToValue={(option, value) => option.value === value.value}
                  />
                </Grid>
              </Grid>
              <Autocomplete
                autoSelect={true}
                name="stage"
                options={this.stages}
                renderInput={(params) => (<TextField {...params} label="Stage" variant="standard" />)}
                onChange={(event, value) => this.handleAutocompleteInputChange(event, value, 'stage')}
                isOptionEqualToValue={(option, value) => option.value === value.value}
              />
              <div>
                <FormControlLabel control={<Checkbox />} label="Did Combo Kill?" onChange={this.handleInputChange} name="didKill" checked={this.state.didKill} />
                <FormControlLabel control={<Checkbox />} label="Zero to Death?" onChange={this.handleInputChange} name="zeroToDeath" checked={this.state.zeroToDeath} />

              </div>
              <div>
                <TextField label="Minimum damage done" type="number" placeholder="Minimum %" onChange={this.handleInputChange} name="minimumDamage" value={this.state.minimumDamage} />
                <TextField label="Maximum damage done" type="number" placeholder="Max %" onChange={this.handleInputChange} name="maximumDamage" value={this.state.maximumDamage} />
              </div>
              <div>
                <TextField label="Minimum move count" type="number" placeholder="Minimum moves in combo" onChange={this.handleInputChange} name="minimumMove" value={this.state.minimumMove} />
                <TextField label="Maximum move count" type="number" placeholder="Max moves in combo" onChange={this.handleInputChange} name="maximumMove" value={this.state.maximumMove} />
              </div>
              <div>
                <FormControlLabel control={<Checkbox />} label="Exclude assigned conversions?" onChange={this.handleInputChange} name="excludeAssigned" checked={this.state.excludeAssigned} />
              </div>

              <Grid container >
                {/* <Grid item>
                  <Autocomplete
                    multiple
                    options={this.moves}
                    getOptionLabel={(item) => item.label}
                    renderInput={(params) => (<TextField {...params} label="Combo contains string" variant="standard" />)}
                    onChange={(event, value, reason, details) => this.handleAutocompleteInputChange(event, value, 'comboContains')}
                    isOptionEqualToValue={(option, value) => false}
                  />
                </Grid> */}
                <Grid item>
                  <Autocomplete
                    multiple
                    options={this.moves}
                    getOptionLabel={(item) => item.label}
                    renderInput={(params) => (<TextField {...params} label="Combo starts with string" variant="standard" />)}
                    onChange={(event, value, reason, details) => this.handleAutocompleteInputChange(event, value, 'comboStartsWith')}
                    isOptionEqualToValue={(option, value) => false}
                  />
                </Grid>
                <Grid item>
                  <Autocomplete
                    multiple
                    options={this.moves}
                    getOptionLabel={(item) => item.label}
                    renderInput={(params) => (<TextField {...params} label="Combo ends with string" variant="standard" />)}
                    onChange={(event, value, reason, details) => this.handleAutocompleteInputChange(event, value, 'comboEndsWith')}
                    isOptionEqualToValue={(option, value) => false}
                  />
                </Grid>
              </Grid >

              <Button type="submit" variant="contained">Search Conversions</Button>
            </span>
          }
          {this.state.conversions.length > 0
            ? <div>
              <Button variant="contained" onClick={() => this.clearConversions()}>Go back to search</Button>
              <div style={{ height: '900px', width: '100%' }}>
                <ConversionDataGrid data={this.state.conversions} maxCount={this.state.conversionCount} handlePageChange={(pageNumber) => this.setPage(pageNumber)}
                  handleSortModelChange={(e) => this.handleSortModelChange(e)} handlePageSize={(newPageSize) => this.handlePageSize(newPageSize)} pageSize={this.state.pageSize}
                  sortModel={[{ field: this.state.sortField, sort: this.state.sortDir }]}
                />
              </div>
            </div>
            : <div> No Conversions Found</div>
          }
        </Box>
      </div>


    );
  }
}



function sleep(delay = 0) {
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}