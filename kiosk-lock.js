/********************************************************
 * 
 * Macro Author:      	William Mills
 *                    	Technical Solutions Specialist 
 *                    	wimills@cisco.com
 *                    	Cisco Systems
 * 
 * Version: 1-0-0
 * Released: 06/03/24
 * 
 * This is an example Cisco Desk and Board device lock and unlock
 * macro leveragin Kiosk mode on the device to lock the interface.
 * 
 * This macro also features custom icons which are downloaded to the device.
 * 
 * Full Readme, source code and license details for this macro are available 
 * on Github: https://github.com/wxsd-sales/kiosk-lock-macro
 * 
 ********************************************************/

import xapi from 'xapi';

/*********************************************************
 * Configure the settings below
**********************************************************/

const config = {
  pin: '1234',
  button: {
    lock: {
      name: 'Lock Device',
      icon: 'https://wxsd-sales.github.io/kiosk-lock-macro/images/locked.png'
    },
    unlock: {
      name: 'Unlock Device',
      icon: 'https://wxsd-sales.github.io/kiosk-lock-macro/images/unlocked.png'
    }
  },
  disableSettings: false,
  disableAssistant: true,
  disableUltrasound: true,
  autoCleanupOnStandby: false,  // Clear web cache when entering standby
  autoCleanupOnHalfwake: false, // Clear web cache when entering halfwake
  autoEnableKioskOnStandby: true,
  autoEnableKioskOnHalfwake: false,
  autoDisableStandby: true,
  panelId: 'kiosklock'
}


/*********************************************************
 * Do not change below
**********************************************************/

// This is our main function which initializes everything
async function main() {

  // Create our Button and UI Panel
  await createButtons();

  // Enable WebEngine and WebGL
  xapi.Config.WebEngine.Mode.set('On');
  xapi.Config.WebEngine.Features.WebGL.set('On');

  // Disable/enable recommended features
  xapi.Config.UserInterface.SettingsMenu.Mode.set(config.disableSettings ? 'Locked' : 'Unlocked');
  xapi.Config.UserInterface.Assistant.Mode.set(config.disableAssistant ? 'Off' : 'On');
  xapi.Config.Audio.Ultrasound.MaxVolume.set(config.disableUltrasound ? 0 : 70);

  // Subscribe to  Panel Click events
  xapi.Event.UserInterface.Extensions.Panel.Clicked.on(async event => {
    if (!event.PanelId.startsWith(config.panelId)) return;
    if ( await inKioskMode()) {
      console.log(`[${config.panelId}] Clicked - Kiosk Mode Enabled - Prompting For PIN`)
      askForPIN();
    } else {
      console.log(`[${config.panelId}] Clicked - Kiosk Mode Disabled - Enabling Kiosk Mode`)
      setKioskMode('On');
      createButtons();
    }
  });

  // Subscribe to Text Inputs and Prompt Responses
  xapi.Event.UserInterface.Message.TextInput.Response.on(processTextResponse)
  xapi.Event.UserInterface.Message.Prompt.Response.on(warningResponse);


  xapi.Status.Standby.State.on(async state => {
    console.log('Standby State Changed To: ', state)
    const inKioskMode = await getKioskMode();
    if (inKioskMode) return // Take no action if kiosk mode is already enabled.

    if (state === 'EnteringStandby' || state === 'Standby') {
      if (config.autoCleanupOnStandby) performRoomClean();
      if (config.autoEnableKioskOnStandby) setKioskMode('On')
      if (config.autoDisableStandby) setStandbyControl('Off')
    }

    if (state === 'Halfwake') {
      if (config.autoCleanupOnHalfwake) performRoomClean();
      if (config.autoEnableKioskOnHalfwake) setKioskMode('On')
      if (config.autoDisableStandby) setStandbyControl('Off')
    }

  });

  // Subscribe to Room Clean and Standby Events for Debug Logging
  xapi.Event.RoomCleanup.Complete
    .on(value => console.debug('Cleanup Result:', value.Result));
  xapi.Event.Standby.SecondsToStandby
    .on(value => console.debug('Seconds To Standby:', value));
  xapi.Event.Standby.Reset
    .on(value => console.debug('Standby Reset Event:', value));
}

main();

/*********************************************************
 * Below are the function which this macro uses
**********************************************************/


function inKioskMode() {
  return xapi.Config.UserInterface.Kiosk.Mode.get().then(result => result === 'On')
}

function setKioskMode(mode) {
  console.log('Setting Kiosk Mode To:', mode);
  xapi.Config.UserInterface.Kiosk.Mode.set(mode);
}

function setStandbyControl(mode) {
  console.log('Setting Standby Control To:', mode);
  xapi.Config.Standby.Control.set(mode);
  if (mode === 'Off') xapi.Command.Standby.Deactivate();
}

function performRoomClean() {
  console.log('Performing Room Cleanup');
  xapi.Command.RoomCleanup.Run({ ContentType: ['TemporaryAccounts', 'Whiteboards', 'WebData'] });
}

// Here we handle the user response to the warning message
function warningResponse(response) {
  if (response.FeedbackId != 'kiosk_warning') return;
  switch (response.OptionId) {
    case '1':
      console.log('Warning accepted, enabling Kiosk Mode');
      setKioskMode('On');
      break;
    case '2':
      console.log('Warning rejected, not enabling kiosk Mode');
      syncUI();
      break;
  }
}

function processTextResponse(event) {
  if (!event.FeedbackId.startsWith(config.panelId)) return;
  const responseType = event.FeedbackId.split('-').pop();
  switch (responseType) {
    case 'pin':
      if (event.Text == config.pin) {
        console.log('Valid PIN Entered - Opening Kiosk Control Panel');
        setKioskMode('Off')
        return;
      } else {
        console.log('Invalid PIN Entered - Displaying Invalid PIN Alert');
        xapi.Command.UserInterface.Message.Alert.Display(
          { Duration: 5, Text: 'The PIN entered was invalid<br> please try again', Title: 'Invalid PIN' });
      }
      break;
  }
}


function askForPIN() {
  xapi.Command.UserInterface.Message.TextInput.Display({
    FeedbackId: config.panelId + '-pin',
    InputType: 'PIN',
    Placeholder: 'Please Enter PIN',
    SubmitText: 'Submit',
    Text: 'Please Enter PIN',
    Title: config.button.name
  });
}


// This function creates initial buttons which can open the hidden panel
async function createButtons() {

  const state =  await inKioskMode() ? 'unlock' : 'lock';
  const button = config.button[state];
  const panelId = config.panelId;
  const locations = ['HomeScreen', 'ControlPanel'];

  locations.forEach(async location => {

    const order = await panelOrder(panelId + location)
    const icon = button.icon.startsWith('http') ?  await getIcon(button.icon) : `<Icon>${icon}</Icon>`;
    const color = button?.color ?? '';

    const panel = `<Extensions>
                  <Panel>
                    <Location>${location}</Location>
                    ${icon}
                    ${color}
                    <Name>${button.name}</Name>
                    ${order}
                    <ActivityType>Custom</ActivityType>
                  </Panel>
                </Extensions>`;
    await xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: panelId + location }, panel)
      .catch(error => console.log(`Unable to save panel [${panelId}] - `, error.Message))
  })
}


/*********************************************************
 * Downloads Icon from provided URL and returns the 
 * Icon Id as the required UI Extension XML string
 **********************************************************/
function getIcon(url) {
  return xapi.Command.UserInterface.Extensions.Icon.Download({ Url: url })
    .then(result => `<Icon>Custom</Icon><CustomIcon><Id>${result.IconId}</Id></CustomIcon>`)
    .catch(error => {
      console.log('Unable to download icon: ' + error.message)
      return false
    })
}

/*********************************************************
 * Gets the current Panel Order if exiting Macro panel is present
 * to preserve the order in relation to other custom UI Extensions
 **********************************************************/
async function panelOrder(panelId) {
  const list = await xapi.Command.UserInterface.Extensions.List({ ActivityType: "Custom" });
  const panels = list?.Extensions?.Panel
  if (!panels) return -1
  const existingPanel = panels.find(panel => panel.PanelId == panelId)
  if (!existingPanel) return -1
  return existingPanel.Order
}